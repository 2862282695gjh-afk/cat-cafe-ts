/**
 * Anthropic Messages API 直连 Provider
 *
 * 不依赖 SDK、不启动 CLI 进程，直接 fetch + SSE 流式。
 * 通过消息历史实现会话复用，无进程启动开销。
 */
import type {
  StreamEvent,
  ThinkingBlock,
  TextBlock,
  ToolUseBlock,
  SendOptions,
  ResultEvent,
} from "@cat-cafe/core";

const DEFAULT_BASE_URL = "https://api.anthropic.com";

export interface ApiProviderConfig {
  systemPrompt?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string | ApiContentBlock[];
}

interface ApiContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export class ApiProvider {
  private systemPrompt: string | undefined;
  private model: string;
  private baseUrl: string;
  private apiKey: string;
  private maxTokens: number;
  private history: ApiMessage[] = [];
  private _sessionId: string;

  constructor(config: ApiProviderConfig = {}) {
    this.systemPrompt = config.systemPrompt;
    this.model = config.model ?? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "claude-sonnet-4-20250514";
    this.baseUrl = config.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL;
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.maxTokens = config.maxTokens ?? 8192;
    this._sessionId = crypto.randomUUID();
  }

  get sessionId(): string {
    return this._sessionId;
  }

  set sessionId(id: string) {
    this._sessionId = id;
  }

  async *send(
    prompt: string,
    options: SendOptions = {},
  ): AsyncGenerator<StreamEvent, void, undefined> {
    if (options.signal?.aborted) {
      yield { type: "error", message: "请求已取消" };
      return;
    }

    // 追加用户消息到历史
    this.history.push({ role: "user", content: prompt });

    // 构建 assistant content（包含历史中的 assistant 回复）
    const messages = [...this.history];
    if (this.systemPrompt && messages.length === 1) {
      // 第一轮：system prompt 通过 system 参数传递
    }

    // 构建 request body
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      stream: true,
      messages,
    };

    if (this.systemPrompt) {
      body.system = this.systemPrompt;
    }

    let fullText = "";
    let fullThinking = "";
    let gotResponse = false;

    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        yield { type: "error", message: `API ${res.status}: ${errText.slice(0, 200)}` };
        // 回滚用户消息
        this.history.pop();
        return;
      }

      // 解析 SSE 流
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentBlockType = "";
      let currentBlockIndex = 0;
      let currentBlockId = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (options.signal?.aborted) {
          yield { type: "error", message: "请求已取消" };
          reader.cancel();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          const eventType = data.type as string;

          if (eventType === "message_start") {
            const msg = data.message as Record<string, unknown> | undefined;
            const sid = msg?.id as string | undefined;
            if (sid) this._sessionId = sid;
            yield {
              type: "system",
              subtype: "init",
              session_id: this._sessionId,
              model: this.model,
              tools: [],
              cwd: "",
              uuid: crypto.randomUUID(),
            } as StreamEvent;
          } else if (eventType === "content_block_start") {
            const block = data.content_block as Record<string, unknown> | undefined;
            currentBlockType = (block?.type as string) ?? "";
            currentBlockIndex = data.index as number ?? 0;
            currentBlockId = (block?.id as string) ?? "";
          } else if (eventType === "content_block_delta") {
            const delta = data.delta as Record<string, unknown> | undefined;
            const deltaType = (delta?.type as string) ?? "";

            if (deltaType === "thinking_delta") {
              const text = (delta?.thinking as string) ?? "";
              if (text) {
                fullThinking += text;
                yield {
                  type: "assistant",
                  message: {
                    id: `msg-${this._sessionId}`,
                    type: "message",
                    role: "assistant",
                    model: this.model,
                    content: [{ type: "thinking", thinking: fullThinking } as ThinkingBlock],
                    stop_reason: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                  },
                  parent_tool_use_id: null,
                  session_id: this._sessionId,
                  uuid: crypto.randomUUID(),
                } as StreamEvent;
              }
            } else if (deltaType === "text_delta") {
              const text = (delta?.text as string) ?? "";
              if (text) {
                fullText += text;
                gotResponse = true;
                yield {
                  type: "assistant",
                  message: {
                    id: `msg-${this._sessionId}`,
                    type: "message",
                    role: "assistant",
                    model: this.model,
                    content: [{ type: "text", text: fullText } as TextBlock],
                    stop_reason: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                  },
                  parent_tool_use_id: null,
                  session_id: this._sessionId,
                  uuid: crypto.randomUUID(),
                } as StreamEvent;
              }
            } else if (deltaType === "input_json_delta") {
              // tool input streaming - 暂时忽略
            }
          } else if (eventType === "content_block_stop") {
            // block 结束
          } else if (eventType === "message_delta") {
            // token usage update
          } else if (eventType === "message_stop") {
            // 消息完成
          }
        }
      }

      // 构造最终 result 事件
      if (gotResponse) {
        // 追加 assistant 回复到历史
        this.history.push({ role: "assistant", content: fullText });

        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 0,
          duration_api_ms: 0,
          num_turns: 1,
          result: fullText,
          stop_reason: "end_turn",
          session_id: this._sessionId,
          total_cost_usd: 0,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          uuid: crypto.randomUUID(),
        } as ResultEvent;
      } else {
        this.history.pop();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort")) {
        yield { type: "error", message: "请求已取消" };
      } else {
        yield { type: "error", message: msg };
        this.history.pop();
      }
    }
  }

  /** 重置会话历史 */
  reset() {
    this.history = [];
    this._sessionId = crypto.randomUUID();
  }
}
