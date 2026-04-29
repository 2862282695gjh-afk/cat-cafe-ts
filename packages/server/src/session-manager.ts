/**
 * Session Chain — 上下文窗口管理
 *
 * 参考 cat-cafe-tutorials Session Chain 设计：
 * - 事前拦截：发送消息前检查 token 占用率
 * - 封印（Seal）：超阈值时标记旧 session 为 sealed
 * - Sub-agent 尸检：满血 sub-agent 读完整 transcript 生成结构化 digest
 * - 重生（Bootstrap）：新 session 注入 digest + 长期记忆 + 规则
 *
 * 优势：不让濒死猫写遗书，而是让满血的新猫查旧记录。
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ResultEvent } from "@cat-noodle/core";
import { ClaudeProcess } from "@cat-noodle/provider-claude";
import { FileMemoryStore } from "./store/file-memory.js";
import { loadChain, saveChain, getActiveSessionRecord, type SessionRecord } from "./store/session-store.js";

// ========== 类型 ==========

interface SessionState {
  sessionId: string;
  totalInputTokens: number;
  contextWindow: number;
}

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

// ========== SessionManager ==========

export class SessionManager {
  private states = new Map<string, SessionState>();
  private memoryStore: FileMemoryStore;
  private threshold: number;

  constructor(memoryStore: FileMemoryStore, threshold = 0.85) {
    this.memoryStore = memoryStore;
    this.threshold = threshold;
  }

  /** 更新 session token 状态（从 result 事件中提取） */
  updateState(agentId: string, result: ResultEvent): void {
    const usage = result.usage;
    const totalInput = usage.input_tokens
      + (usage.cache_read_input_tokens ?? 0)
      + (usage.cache_creation_input_tokens ?? 0);

    let contextWindow = 200_000;
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
    });
  }

  /** 事前检查：是否需要封印 */
  shouldSealBeforeSend(agentId: string, estimatedNewTokens: number): boolean {
    const state = this.states.get(agentId);
    if (!state) return false;

    const projected = state.totalInputTokens + estimatedNewTokens;
    const ratio = projected / state.contextWindow;

    if (ratio >= this.threshold) {
      console.log(`[SessionChain] agent ${agentId}: 投影占用率 ${(ratio * 100).toFixed(1)}% >= ${(this.threshold * 100).toFixed(0)}%，需要封印`);
      return true;
    }

    return false;
  }

  /** 封印：标记旧 session 为 sealed，生成 digest */
  async seal(agentId: string, threadId: string): Promise<void> {
    const active = getActiveSessionRecord(threadId, agentId);
    if (!active) {
      console.log(`[SessionChain] agent ${agentId}: 无 active session，跳过封印`);
      return;
    }

    const state = this.states.get(agentId);
    const fillRatio = state ? state.totalInputTokens / state.contextWindow : 0;

    // 1. 读取完整 transcript
    console.log(`[SessionChain] agent ${agentId}: 读取 session ${active.sessionId.slice(0, 8)}... 的 transcript`);
    const history = await this.readSessionHistory(active.sessionId);

    // 2. 生成结构化 digest（sub-agent 尸检）
    let digest = "";
    if (history.length > 0) {
      console.log(`[SessionChain] agent ${agentId}: sub-agent 生成 digest（${history.length} 条消息）`);
      digest = await this.generateDigest(history);
    }

    // 3. 更新 chain 记录
    const chain = loadChain(threadId, agentId);
    const record = chain.find((r) => r.sessionId === active.sessionId);
    if (record) {
      record.status = "sealed";
      record.sealedAt = Date.now();
      record.fillRatio = fillRatio;
      record.digest = digest;
    }
    saveChain(threadId, agentId, chain);

    // 4. 保存摘要到长期记忆
    if (digest) {
      await this.memoryStore.updateMemory(agentId, { conversationSummary: digest });
    }

    console.log(`[SessionChain] agent ${agentId}: session ${active.sessionId.slice(0, 8)}... 已封印（fillRatio=${(fillRatio * 100).toFixed(1)}%）`);
  }

  /** 重生：构建新 session 的注入内容 */
  async bootstrap(agentId: string, threadId: string): Promise<string> {
    const chain = loadChain(threadId, agentId);

    // 上一个 sealed session 的 digest
    const lastSealed = [...chain].reverse().find((r) => r.status === "sealed");
    const generation = chain.length + 1;

    // 长期记忆
    const memoryContext = await this.memoryStore.buildMemoryContext(agentId);

    const parts: string[] = [
      `=== Session Chain 重生 ===`,
      `你是第 ${generation} 代 session。`,
    ];

    if (lastSealed) {
      parts.push(`上一代 session（第 ${lastSealed.generation} 代）的摘要如下。`);
    }

    if (memoryContext) {
      parts.push(`\n## 长期记忆\n${memoryContext}`);
    }

    if (lastSealed?.digest) {
      parts.push(`\n## 上一代 Session 摘要（第 ${lastSealed.generation} 代）\n${lastSealed.digest}`);
    }

    parts.push(`\n## 规则`);
    parts.push(`当你不确定"之前做了什么、为什么那样做"时，不要猜。基于你手头的摘要和记忆继续工作。`);
    parts.push(`=== Session Chain 重生结束 ===`);

    return parts.join("\n");
  }

  /** 记录新 session 到 chain */
  registerNewSession(agentId: string, threadId: string, sessionId: string): void {
    const chain = loadChain(threadId, agentId);
    chain.push({
      sessionId,
      generation: chain.length + 1,
      status: "active",
      fillRatio: 0,
    });
    saveChain(threadId, agentId, chain);
    console.log(`[SessionChain] agent ${agentId}: 注册新 session ${sessionId.slice(0, 8)}...（第 ${chain.length} 代）`);
  }

  /** 获取当前 session ID */
  getSessionId(agentId: string): string | null {
    return this.states.get(agentId)?.sessionId ?? null;
  }

  // ========== 私有方法 ==========

  /** 读取 session JSONL 文件中的对话历史 */
  private async readSessionHistory(sessionId: string): Promise<SessionMessage[]> {
    const claudeDir = join(homedir(), ".claude", "projects");
    let dirNames: string[];

    try {
      dirNames = await readdir(claudeDir);
    } catch {
      return [];
    }

    for (const name of dirNames) {
      const filePath = join(claudeDir, name, `${sessionId}.jsonl`);
      try {
        const raw = await readFile(filePath, "utf-8");
        return this.parseSessionJsonl(raw);
      } catch {
        // 文件不存在，尝试下一个目录
      }
    }

    console.log(`[SessionChain] session file not found: ${sessionId}`);
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
          if (content) messages.push({ role: "assistant", content });
        }
      } catch {
        // 跳过无法解析的行
      }
    }

    return messages;
  }

  /** 从 content 中提取纯文本 */
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

  /** Sub-agent 尸检：读完整 transcript 生成结构化 digest */
  private async generateDigest(messages: SessionMessage[]): Promise<string> {
    const conversation = messages
      .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n\n");

    const prompt = `你的任务是对以下对话进行详细摘要，用于后续恢复上下文。这是一个多 Agent 协作系统中的猫咪 Agent 的对话记录。

先用 <analysis> 标签按时间顺序分析每条消息，识别：
- 用户的请求和意图
- 你的处理方法和关键决策
- 涉及的文件名、代码片段、函数签名
- 遇到的错误和修复方式
- 用户反馈（尤其是纠正你做法的反馈）

然后用 <summary> 标签输出结构化摘要，必须包含以下 9 个部分：

1. 主要请求与意图：所有明确的请求和目标
2. 关键技术概念：涉及的技术、框架、API、设计模式
3. 文件与代码：读取、修改、创建的文件，说明为什么重要，包含关键代码片段
4. 错误与修复：遇到的错误及修复方式，用户反馈的纠正
5. 问题解决：已解决的问题和进行中的排查
6. 所有用户消息：列出所有非工具调用的用户/其他猫咪消息
7. 待处理任务：尚未完成的任务列表（非常重要，不要遗漏）
8. 当前工作：压缩前正在做什么，包含具体文件名和代码片段
9. 下一步：与当前工作直接相关的下一步操作，引用最近的对话原文

--- 对话历史 ---
${conversation}

--- 摘要 ---`;

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

      const summaryMatch = result.match(/<summary>([\s\S]*?)<\/summary>/);
      if (summaryMatch) {
        return summaryMatch[1].trim();
      }

      return result.trim() || "（对话内容过短，无需摘要）";
    } catch (err) {
      compressor.stop();
      console.error("[SessionChain] digest 生成失败:", err);
      return "（摘要生成失败，历史记录不可用）";
    }
  }
}
