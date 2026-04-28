/**
 * 内存存储实现
 */
import type { Store, ThreadMeta, Message, AgentConfig } from "./interface.js";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class MemoryStore implements Store {
  private threads = new Map<string, ThreadMeta>();
  private messages = new Map<string, Message[]>();
  private agents = new Map<string, AgentConfig>();
  private longMemory = new Map<string, Record<string, string>>();
  private threadMemory = new Map<string, Record<string, string>>();

  // Thread
  async getThreads(): Promise<ThreadMeta[]> {
    return [...this.threads.values()].sort(
      (a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0),
    );
  }

  async getThread(threadId: string): Promise<ThreadMeta | null> {
    return this.threads.get(threadId) ?? null;
  }

  async createThread(threadId: string, meta?: Partial<ThreadMeta>): Promise<void> {
    const now = Date.now();
    this.threads.set(threadId, {
      id: threadId,
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      ...meta,
    });
    this.messages.set(threadId, []);
  }

  async updateThread(threadId: string, meta: Partial<ThreadMeta>): Promise<void> {
    const existing = this.threads.get(threadId);
    if (!existing) return;
    this.threads.set(threadId, { ...existing, ...meta, updatedAt: Date.now() });
  }

  async deleteThread(threadId: string): Promise<void> {
    this.threads.delete(threadId);
    this.messages.delete(threadId);
  }

  // Messages
  async getMessages(threadId: string): Promise<Message[]> {
    return this.messages.get(threadId) ?? [];
  }

  async saveMessage(msg: Omit<Message, "id" | "timestamp">): Promise<Message> {
    const full: Message = { ...msg, id: uid(), timestamp: Date.now() };
    const list = this.messages.get(msg.threadId);
    if (list) {
      list.push(full);
    } else {
      this.messages.set(msg.threadId, [full]);
    }
    // 更新线程活跃时间
    const thread = this.threads.get(msg.threadId);
    if (thread) {
      thread.lastActivity = full.timestamp;
      if (msg.role === "user" && !thread.title) {
        thread.title = msg.content.slice(0, 30) + (msg.content.length > 30 ? "..." : "");
      }
      thread.updatedAt = full.timestamp;
    }
    return full;
  }

  // Agents
  async getAgents(): Promise<AgentConfig[]> {
    return [...this.agents.values()];
  }

  async getAgent(agentId: string): Promise<AgentConfig | null> {
    return this.agents.get(agentId) ?? null;
  }

  async saveAgent(config: AgentConfig): Promise<void> {
    this.agents.set(config.id, config);
  }

  async deleteAgent(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }

  // Memory
  async getLongMemory(agentId: string): Promise<Record<string, string>> {
    return this.longMemory.get(agentId) ?? {};
  }

  async setLongMemory(agentId: string, key: string, value: string): Promise<void> {
    const mem = this.longMemory.get(agentId) ?? {};
    mem[key] = value;
    this.longMemory.set(agentId, mem);
  }

  async removeLongMemory(agentId: string, key: string): Promise<void> {
    const mem = this.longMemory.get(agentId);
    if (mem) {
      delete mem[key];
    }
  }

  async getThreadMemory(threadId: string, agentId: string): Promise<Record<string, string>> {
    return this.threadMemory.get(`${threadId}:${agentId}`) ?? {};
  }

  async setThreadMemory(threadId: string, agentId: string, key: string, value: string): Promise<void> {
    const mapKey = `${threadId}:${agentId}`;
    const mem = this.threadMemory.get(mapKey) ?? {};
    mem[key] = value;
    this.threadMemory.set(mapKey, mem);
  }
}
