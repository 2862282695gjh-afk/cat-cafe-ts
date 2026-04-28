/**
 * 上下文窗口管理 — 检测占用率 + 压缩调度
 *
 * 每次 result 后检查 token 占用率，超阈值时：
 * 1. 读取旧 session JSONL
 * 2. 用子 agent 生成摘要
 * 3. 切换新 session，注入摘要
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ResultEvent } from "@cat-cafe/core";
import { ClaudeProcess } from "@cat-cafe/provider-claude";
import { FileMemoryStore } from "./store/file-memory.js";

// ========== 类型 ==========

interface SessionState {
  sessionId: string;
  totalInputTokens: number;
  contextWindow: number;
  summary: string;
  lastOperation: string;
  compacted: boolean;
}

interface CompactDecision {
  shouldCompact: boolean;
  alreadyCompacting: boolean;
  usageRatio: number;
}

export interface CompactedSession {
  summary: string;
  lastOperation: string;
  lastMessages: string[];
  tokensSaved: number;
}

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

// ========== SessionManager ==========

export class SessionManager {
  private states = new Map<string, SessionState>();
  private compacting = new Map<string, boolean>();
  private memoryStore: FileMemoryStore;
  private threshold: number;

  constructor(memoryStore: FileMemoryStore, threshold = 0.7) {
    this.memoryStore = memoryStore;
    this.threshold = threshold;
  }

  /** 更新 session 状态（从 result 事件中提取） */
  updateState(agentId: string, result: ResultEvent): void {
    const usage = result.usage;
    const totalInput = usage.input_tokens
      + (usage.cache_read_input_tokens ?? 0)
      + (usage.cache_creation_input_tokens ?? 0);

    // 尝试从 modelUsage 获取 contextWindow
    let contextWindow = 200_000; // 默认值
    if (result.modelUsage) {
      for (const info of Object.values(result.modelUsage) as Array<{ contextWindow: number }>) {
        if (info.contextWindow > 0) {
          contextWindow = info.contextWindow;
          break;
        }
      }
    }

    this.states.set(agentId, {
      sessionId: result.session_id,
      totalInputTokens: totalInput,
      contextWindow,
      summary: this.states.get(agentId)?.summary ?? "",
      lastOperation: "",
      compacted: false,
    });
  }

  /** 获取当前 session ID */
  getSessionId(agentId: string): string | null {
    return this.states.get(agentId)?.sessionId ?? null;
  }

  /** 检查是否需要压缩 */
  checkAndCompact(agentId: string, result: ResultEvent): CompactDecision {
    this.updateState(agentId, result);
    const state = this.states.get(agentId);
    if (!state) return { shouldCompact: false, alreadyCompacting: false, usageRatio: 0 };

    const usageRatio = state.totalInputTokens / state.contextWindow;
    const alreadyCompacting = this.compacting.get(agentId) ?? false;

    return {
      shouldCompact: usageRatio >= this.threshold && !alreadyCompacting && !state.compacted,
      alreadyCompacting,
      usageRatio,
    };
  }

  /** 执行压缩 */
  async compact(
    agentId: string,
    oldSessionId: string,
    onReset: (summary: string) => void,
  ): Promise<CompactedSession> {
    this.compacting.set(agentId, true);

    try {
      // 1. 读取旧 session 历史
      const history = await this.readSessionHistory(oldSessionId);

      if (history.length === 0) {
        console.log(`[SessionManager] session ${oldSessionId} 无可压缩内容`);
        return { summary: "", lastOperation: "", lastMessages: [], tokensSaved: 0 };
      }

      // 2. 保留最后几条消息（避免断档）
      const KEEP_LAST = 4;
      const recentMessages = history.slice(-KEEP_LAST);
      const messagesToSummarize = history.slice(0, -KEEP_LAST);

      // 3. 用子 agent 生成摘要
      const summary = await this.generateSummary(messagesToSummarize);

      // 4. 提取最后操作状态
      const lastOperation = this.extractLastOperation(recentMessages);

      // 5. 保存摘要到长期记忆
      await this.memoryStore.updateMemory(agentId, {
        conversationSummary: summary,
      });

      // 6. 计算节省的 token
      const originalSize = JSON.stringify(history).length;
      const summarySize = summary.length + JSON.stringify(recentMessages).length;
      const stateTokens = this.states.get(agentId)?.totalInputTokens ?? 0;
      const tokensSaved = Math.round((1 - summarySize / originalSize) * stateTokens);

      // 7. 构建新 session 注入内容
      const memoryContext = await this.memoryStore.buildMemoryContext(agentId);
      const newSummary = [
        memoryContext,
        summary ? `### 历史对话摘要\n${summary}` : "",
        lastOperation ? `### 当前状态\n${lastOperation}` : "",
      ].filter(Boolean).join("\n\n");

      // 8. 通知进程重置 session
      onReset(newSummary);

      // 9. 更新状态
      const state = this.states.get(agentId);
      if (state) {
        state.summary = newSummary;
        state.compacted = true;
        state.lastOperation = lastOperation;
      }

      console.log(`[SessionManager] agent ${agentId} session compressed: ${oldSessionId.slice(0, 8)}..., saved ~${tokensSaved} tokens`);

      return { summary: newSummary, lastOperation, lastMessages: recentMessages.map((m) => m.content), tokensSaved };
    } finally {
      this.compacting.set(agentId, false);
    }
  }

  /** 读取 session JSONL 文件中的对话历史 */
  private async readSessionHistory(sessionId: string): Promise<SessionMessage[]> {
    const claudeDir = join(homedir(), ".claude", "projects");
    const projectDirs = await readdir(claudeDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const filePath = join(claudeDir, dir.name, `${sessionId}.jsonl`);
      try {
        const raw = await readFile(filePath, "utf-8");
        return this.parseSessionJsonl(raw);
      } catch {
        // 文件不存在，尝试下一个目录
      }
    }

    console.log(`[SessionManager] session file not found: ${sessionId}`);
    return [];
  }

  /** 解析 JSONL，提取 user/assistant 消息 */
  private parseSessionJsonl(raw: string): SessionMessage[] {
    const messages: SessionMessage[] = [];

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const type = obj.type;

        if (type === "user") {
          const content = this.extractText(obj.message?.content);
          if (content) messages.push({ role: "user", content });
        } else if (type === "assistant") {
          const content = this.extractText(obj.message?.content);
          // 跳过空内容（纯工具调用）
          if (content) messages.push({ role: "assistant", content });
        }
      } catch {
        // 跳过无法解析的行
      }
    }

    return messages;
  }

  /** 从 content 中提取纯文本（支持 string 和 content block 数组） */
  private extractText(content: unknown): string {
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .filter((b: Record<string, unknown>) => b.type === "text")
        .map((b: Record<string, unknown>) => (b.text as string)?.trim() ?? "")
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  /** 用子 agent 生成对话摘要 */
  private async generateSummary(messages: SessionMessage[]): Promise<string> {
    if (messages.length === 0) return "";

    const conversation = messages
      .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n\n");

    const prompt = `请将以下对话历史压缩为简洁的摘要。要求：
1. 保留关键决策和结论
2. 保留用户提到的偏好和需求
3. 记录当前工作进度和未完成的事项
4. 省略中间的思考过程和工具调用细节
5. 控制在 500 字以内

--- 对话历史 ---
${conversation}

--- 摘要 ---`;

    // 用独立的 ClaudeProcess 执行压缩（非持久，用完即弃）
    const compressor = new ClaudeProcess({ maxRetries: 0 });
    try {
      let result = "";
      for await (const event of compressor.send(prompt)) {
        if (event.type === "assistant") {
          const ae = event as { message: { content: Array<{ type: string; text?: string }> } };
          for (const block of ae.message.content) {
            if (block.type === "text" && block.text) {
              result += block.text;
            }
          }
        }
      }
      compressor.stop();
      return result.trim() || "（对话内容过短，无需压缩）";
    } catch (err) {
      compressor.stop();
      console.error("[SessionManager] 压缩失败:", err);
      return "（压缩失败，历史摘要不可用）";
    }
  }

  /** 从最近的对话中提取最后操作状态 */
  private extractLastOperation(messages: SessionMessage[]): string {
    // 找最后一条 assistant 回复的核心内容
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content) {
        const content = messages[i].content;
        // 截取前 300 字作为操作状态
        return content.length > 300 ? content.slice(0, 300) + "..." : content;
      }
    }
    return "";
  }
}
