/**
 * 记忆自动提取器
 *
 * 每 N 轮对话后，用子 agent 从对话中提取长期记忆（用户画像、重要事实等），
 * 增量更新到 FileMemoryStore。
 */
import { ClaudeProcess } from "@cat-noodle/provider-claude";
import { FileMemoryStore, type AgentLongMemory } from "./store/file-memory.js";

interface Turn {
  user: string;
  assistant: string;
}

export class MemoryExtractor {
  private turnCounters = new Map<string, number>();
  private turnBuffers = new Map<string, Turn[]>();
  private interval: number;
  private memoryStore: FileMemoryStore;

  constructor(memoryStore: FileMemoryStore, interval = 10) {
    this.memoryStore = memoryStore;
    this.interval = interval;
  }

  /**
   * 每次 result 后调用，累计轮次，达到 N 轮时用最近 N 轮对话触发提取并自动保存
   */
  async maybeExtract(
    agentId: string,
    userMessage: string,
    assistantReply: string,
  ): Promise<void> {
    const count = (this.turnCounters.get(agentId) ?? 0) + 1;
    this.turnCounters.set(agentId, count);

    // 缓冲最近 N 轮对话
    const buffer = this.turnBuffers.get(agentId) ?? [];
    buffer.push({ user: userMessage, assistant: assistantReply });
    if (buffer.length > this.interval) buffer.shift();
    this.turnBuffers.set(agentId, buffer);

    if (count % this.interval !== 0) return;

    // 提取并自动保存到文件
    const patch = await this.extract(agentId, buffer);
    if (patch) {
      await this.memoryStore.updateMemory(agentId, patch);
    }
  }

  /** 用子 agent 从最近 N 轮对话中提取记忆 */
  private async extract(
    agentId: string,
    turns: Turn[],
  ): Promise<Partial<AgentLongMemory> | null> {
    const existingMemory = await this.memoryStore.getMemory(agentId);
    const existingContext = existingMemory.keyFacts.length > 0
      ? `\n\n已有记忆：${existingMemory.keyFacts.join("; ")}`
      : "";

    const maxChars = 500;
    const conversation = turns
      .map((t, i) => {
        const u = t.user.length > maxChars ? t.user.slice(0, maxChars) + "…" : t.user;
        const a = t.assistant.length > maxChars ? t.assistant.slice(0, maxChars) + "…" : t.assistant;
        return `[第 ${i + 1} 轮]\n用户消息：${u}\n助手回复：${a}`;
      })
      .join("\n\n");

    const prompt = `分析以下 ${turns.length} 轮对话，提取需要长期记住的信息。

${existingContext}

${conversation}

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "userProfile": {
    "新增或更新的字段": "值"
  },
  "keyFacts": ["新增的重要事实"],
  "keyFactsToRemove": ["已过时的事实"]
}

如果没有需要记住的新信息，返回空对象 {}。`;

    const extractor = new ClaudeProcess({ maxRetries: 0 });
    try {
      let result = "";
      for await (const event of extractor.send(prompt)) {
        if (event.type === "assistant") {
          const ae = event as { message: { content: Array<{ type: string; text?: string }> } };
          for (const block of ae.message.content) {
            if (block.type === "text" && block.text) {
              result += block.text;
            }
          }
        }
      }
      extractor.stop();

      // 解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const patch = JSON.parse(jsonMatch[0]) as Partial<AgentLongMemory> & { keyFactsToRemove?: string[] };
      const keyFactsToRemove = patch.keyFactsToRemove;
      delete (patch as Record<string, unknown>).keyFactsToRemove;

      if (Object.keys(patch).length === 0 && !keyFactsToRemove?.length) return null;

      console.log(`[MemoryExtractor] agent ${agentId}: 提取到新记忆`);

      // 如果有要删除的事实，也要传递
      if (keyFactsToRemove?.length) {
        (patch as Record<string, unknown>).keyFactsToRemove = keyFactsToRemove;
      }

      return patch;
    } catch (err) {
      extractor.stop();
      console.error("[MemoryExtractor] 提取失败:", err);
      return null;
    }
  }

  /** 重置轮次计数 */
  resetCounter(agentId: string): void {
    this.turnCounters.set(agentId, 0);
  }
}
