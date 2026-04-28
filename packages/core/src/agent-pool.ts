/**
 * AgentPool — 多 Agent 并行广播 (fan-out/fan-in)
 *
 * 将用户消息同时发给多个 AgentProvider 实例，合并为单一流输出。
 * 不是 agent loop（顺序调用），而是并行扇出。
 */
import { AsyncQueue } from "./async-queue.js";
import type {
  AgentProvider,
  SendOptions,
  StreamEvent,
  TaggedStreamEvent,
  StatusEvent,
  ResultEvent,
} from "./types.js";

export class AgentPool {
  private _agents = new Map<string, AgentProvider>();

  /** 注册一个 Agent 实例 */
  register(agentId: string, provider: AgentProvider): void {
    this._agents.set(agentId, provider);
  }

  /** 移除一个 Agent 实例 */
  unregister(agentId: string): void {
    this._agents.delete(agentId);
  }

  /** 获取所有已注册的 agent ID */
  get agentIds(): string[] {
    return [...this._agents.keys()];
  }

  /** 获取指定 agent */
  get(agentId: string): AgentProvider | undefined {
    return this._agents.get(agentId);
  }

  /**
   * 广播消息到多个 Agent，返回合并后的流
   *
   * @param prompt  用户消息
   * @param agentIds  目标 agent 列表（不传则发给全部）
   * @param signal   取消信号（同时取消所有子进程）
   */
  async *broadcast(
    prompt: string,
    agentIds?: string[],
    signal?: AbortSignal,
  ): AsyncGenerator<TaggedStreamEvent, void, undefined> {
    const targets = agentIds ?? this.agentIds;
    if (targets.length === 0) return;

    const queue = new AsyncQueue<TaggedStreamEvent>();

    // 为每个 agent 启动一个消费者
    const running = new Set<Promise<void>>();

    for (const agentId of targets) {
      const agent = this._agents.get(agentId);
      if (!agent) continue;

      const task = (async () => {
        try {
          for await (const event of agent.send(prompt, { signal })) {
            if (signal?.aborted) break;

            // 提取 session_id 并更新 agent（从 result 事件）
            if (event.type === "result") {
              agent.sessionId = (event as ResultEvent).session_id;
            }

            queue.push({ agentId, event });
          }
        } catch (err) {
          queue.push({
            agentId,
            event: {
              type: "error",
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
      })();

      running.add(task);
      task.finally(() => running.delete(task));
    }

    // 在所有 task 完成后关闭 queue
    void Promise.allSettled(running).then(() => queue.close());

    // 从 queue 中 yield 合并后的事件
    for await (const tagged of queue) {
      if (signal?.aborted) {
        break;
      }
      yield tagged;
    }
  }

  /**
   * 广播并收集所有 agent 的最终文本响应（非流式）
   */
  async broadcastCollect(
    prompt: string,
    agentIds?: string[],
    signal?: AbortSignal,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for await (const tagged of this.broadcast(prompt, agentIds, signal)) {
      const { agentId, event } = tagged;
      if (event.type === "assistant") {
        const ae = event as import("./types.js").AssistantEvent;
        for (const block of ae.message.content) {
          if (block.type === "text") {
            const prev = results.get(agentId) ?? "";
            results.set(agentId, prev + (block as { text: string }).text);
          }
        }
      } else if (event.type === "result") {
        const re = event as ResultEvent;
        if (re.result && !results.has(agentId)) {
          results.set(agentId, re.result);
        }
      }
    }

    return results;
  }
}
