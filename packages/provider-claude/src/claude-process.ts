/**
 * Claude CLI 持久进程管理
 *
 * 启动一个 `claude --output-format stream-json --input-format stream-json --verbose`
 * 持久子进程，通过 stdin 发送 JSON 消息、stdout 接收流式事件。
 * 进程跨消息复用，无需每次 spawn 新进程。
 *
 * 协议:
 *   stdin  → {"type":"user","session_id":"...","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
 *   stdout ← 逐行 JSON (system / assistant / tool_result / result / error)
 */
import { spawn, type ChildProcess } from "node:child_process";
import type {
  StreamEvent,
  SystemEvent,
  ResultEvent,
  AssistantEvent,
  ContentBlock,
  SendOptions,
} from "@cat-cafe/core";

const RETRYABLE_PATTERNS = ["429", "rate limit", "too many requests"];

function isRetryableError(msg: string): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => lower.includes(p));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^claude/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

export interface ClaudeProcessConfig {
  /** 系统提示词（仅首次消息时附加） */
  systemPrompt?: string;
  /** 模型覆盖 */
  model?: string;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 基础重试延迟（秒） */
  baseRetryDelay?: number;
  /** 最大重试延迟（秒） */
  maxRetryDelay?: number;
  /** plan 模式：只能规划不能执行工具 */
  planMode?: boolean;
}

export class ClaudeProcess {
  private proc: ChildProcess | null = null;
  private _sessionId: string | null = null;
  private _systemPrompt: string | undefined;
  private _conversationSummary: string | undefined;
  private _model: string | undefined;
  private _maxRetries: number;
  private _baseRetryDelay: number;
  private _maxRetryDelay: number;
  private _planMode: boolean;

  // 事件管线: stdout → 队列 → send() 消费者
  private eventQueue: StreamEvent[] = [];
  private waiters: Array<(event: StreamEvent | null) => void> = [];
  private _alive = false;

  // 消息排队: Promise 链式锁，保证 send() 顺序执行
  private _queueLock: Promise<void> = Promise.resolve();

  constructor(config: ClaudeProcessConfig = {}) {
    this._systemPrompt = config.systemPrompt;
    this._model = config.model;
    this._maxRetries = config.maxRetries ?? 3;
    this._baseRetryDelay = config.baseRetryDelay ?? 5;
    this._maxRetryDelay = config.maxRetryDelay ?? 60;
    this._planMode = config.planMode ?? false;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  set sessionId(id: string | null) {
    this._sessionId = id;
  }

  /**
   * 启动（或重启）持久 CLI 进程
   *
   * 如果有 sessionId（被 abort 杀掉后重启），使用 --resume 恢复上下文
   */
  private ensure(): Promise<void> {
    if (this.proc && this._alive) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const args = [
        "--output-format", "stream-json",
        "--input-format", "stream-json",
        "--verbose",
      ];

      // plan 模式 agent 禁用所有工具，只能输出纯文字
      if (this._planMode) {
        args.push("--tools", "");
      } else {
        args.push("--dangerously-skip-permissions");
      }

      // 有 sessionId 说明是重启，用 --resume 恢复上下文
      if (this._sessionId) {
        args.push("--resume", this._sessionId);
      }

      if (this._model) {
        args.push("--model", this._model);
      }

      const proc = spawn("claude", args, {
        env: cleanEnv(),
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      });

      this.proc = proc;
      this._alive = true;

      // stdout 逐行解析 → 推入事件队列
      let buf = "";
      proc.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf-8");
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            this.enqueue(JSON.parse(line) as StreamEvent);
          } catch {
            // 忽略无法解析的行
          }
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        console.error("[claude stderr]", chunk.toString("utf-8").trim());
      });

      proc.on("close", () => {
        this._alive = false;
        this.proc = null;
        // 唤醒所有等待者 → null（流结束）
        while (this.waiters.length) this.waiters.shift()!(null);
      });

      proc.once("spawn", resolve);
      proc.once("error", reject);
    });
  }

  private enqueue(event: StreamEvent) {
    if (this.waiters.length > 0) {
      this.waiters.shift()!(event);
    } else {
      this.eventQueue.push(event);
    }
  }

  /** 等待一个事件，流结束或取消时返回 null */
  private one(signal?: AbortSignal): Promise<StreamEvent | null> {
    if (signal?.aborted) return Promise.resolve(null);
    if (this.eventQueue.length > 0) {
      return Promise.resolve(this.eventQueue.shift()!);
    }
    return new Promise<StreamEvent | null>((resolve) => {
      if (signal?.aborted) { resolve(null); return; }
      const w = (e: StreamEvent | null) => resolve(e);
      this.waiters.push(w);
      signal?.addEventListener("abort", () => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, { once: true });
    });
  }

  /**
   * 发送消息到持久 CLI 进程，返回流式事件异步迭代器
   *
   * 多次并发 send() 会自动排队：后到的消息等前一个 result 后再执行。
   */
  async *send(
    prompt: string,
    options: SendOptions = {},
  ): AsyncGenerator<StreamEvent, void, undefined> {
    // ---- 排队锁：等待前一个 send 完成 ----
    const prevLock = this._queueLock;
    let releaseLock!: () => void;
    this._queueLock = new Promise<void>((resolve) => { releaseLock = resolve; });

    // 如果前一个锁不是初始的空 Promise，说明有消息在处理中
    if (prevLock !== Promise.resolve()) {
      yield { type: "status", status: "queued", message: "消息已排队" };
    }

    await prevLock;

    try {
      yield* this._executeSend(prompt, options);
    } finally {
      releaseLock();
    }
  }

  /**
   * 实际的发送逻辑（被排队锁保护）
   */
  private async *_executeSend(
    prompt: string,
    options: SendOptions = {},
  ): AsyncGenerator<StreamEvent, void, undefined> {
    const sid = options.sessionId ?? this._sessionId;

    // 首次消息时附加系统提示词 + 压缩摘要
    let finalPrompt = prompt;
    if (!sid) {
      const prefix = [this._systemPrompt, this._conversationSummary]
        .filter(Boolean)
        .join("\n\n---\n\n");
      if (prefix) {
        finalPrompt = `${prefix}\n\n---\n\n${prompt}`;
      }
    }
    if (finalPrompt.startsWith("-")) {
      finalPrompt = "\n" + finalPrompt;
    }

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      if (options.signal?.aborted) {
        yield { type: "error", message: "请求已取消" };
        return;
      }

      if (attempt > 0) {
        const delay = Math.min(
          this._baseRetryDelay * Math.pow(2, attempt - 1),
          this._maxRetryDelay,
        );
        yield {
          type: "status",
          status: "retry",
          message: `${delay}秒后重试 (${attempt}/${this._maxRetries})`,
        };
        await sleep(delay * 1000, options.signal);
      }

      try {
        await this.ensure();

        const sessionId = sid ?? crypto.randomUUID();
        const userMsg = {
          type: "user",
          session_id: sessionId,
          message: {
            role: "user",
            content: [{ type: "text", text: finalPrompt }],
          },
        };

        if (!this.proc?.stdin?.writable) {
          yield { type: "error", message: "进程 stdin 不可写" };
          return;
        }

        this.proc.stdin.write(JSON.stringify(userMsg) + "\n");
        this._sessionId = sessionId;

        // 消费事件直到 result / error / 流结束
        while (true) {
          if (options.signal?.aborted) {
            this.killProcess();
            yield { type: "error", message: "请求已取消" };
            return;
          }
          const event = await this.one(options.signal);
          if (!event) {
            if (options.signal?.aborted) this.killProcess();
            yield { type: "error", message: options.signal?.aborted ? "请求已取消" : "进程意外退出" };
            return;
          }

          if (event.type === "system" && "session_id" in event) {
            this._sessionId = (event as SystemEvent).session_id;
          }
          if (event.type === "result") {
            this._sessionId = (event as ResultEvent).session_id;
          }

          if (event.type === "assistant") {
            if ((event as AssistantEvent).message.content.some((b: ContentBlock) => b.type === "text")) {
              // got text response
            }
          }

          if (event.type === "result" && (event as ResultEvent).is_error) {
            const errMsg = (event as ResultEvent).result;
            if (isRetryableError(errMsg)) {
              if (attempt < this._maxRetries) {
                yield { type: "status", status: "retry", message: `API 限速，第 ${attempt + 1} 次重试...` };
                break; // 跳出内层循环，外层重试
              }
              yield { type: "error", message: errMsg };
              return;
            }
          }

          yield event;

          if (event.type === "result" || event.type === "error") return;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isRetryableError(msg) && attempt < this._maxRetries) continue;
        yield { type: "error", message: msg };
        return;
      }
    }

    yield { type: "error", message: "API 限制，请稍后重试" };
  }

  /** 杀掉 CLI 进程并清理状态（abort 时调用，下次 send 会重启） */
  private killProcess() {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill("SIGTERM");
      this.proc = null;
      this._alive = false;
      this.eventQueue = [];
      while (this.waiters.length) this.waiters.shift()!(null);
    }
  }

  /**
   * 切换到另一个 session（跨线程隔离）
   *
   * 杀掉当前进程，设置新的 sessionId，
   * 下次 send() 时会用 --resume 恢复正确的上下文。
   */
  switchSession(newSessionId: string | null): void {
    if (this._sessionId === newSessionId && this._alive) return;
    this.killProcess();
    this._sessionId = newSessionId;
  }

  /** 优雅停止持久进程 */
  stop() {
    this.killProcess();
  }

  /**
   * 重置为新 session（压缩后调用）
   *
   * 杀掉旧进程，清除 sessionId，注入压缩摘要。
   * 下次 send() 会启动新进程，摘要会作为 system prompt 的一部分注入。
   */
  resetSession(summary: string) {
    this.killProcess();
    this._sessionId = null;
    this._conversationSummary = summary;
  }
}
