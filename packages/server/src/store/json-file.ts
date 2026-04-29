/**
 * JSON 文件持久化存储
 *
 * 数据目录结构:
 *   data/threads/
 *     index.json          — 线程列表元数据
 *     {threadId}.json      — 线程消息
 *   data/memory/
 *     {agentId}.json       — Agent 长期记忆
 *     {threadId}:{agentId}.json — 线程级记忆
 */
import fs from "node:fs";
import path from "node:path";
import type { Store, ThreadMeta, Message, AgentConfig } from "./interface.js";

const DATA_DIR = path.resolve("data");
const THREADS_DIR = path.join(DATA_DIR, "threads");
const MEMORY_DIR = path.join(DATA_DIR, "memory");

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export class JsonFileStore implements Store {
  private threads: Map<string, ThreadMeta> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private agents: Map<string, AgentConfig> = new Map();
  private longMemory: Map<string, Record<string, string>> = new Map();
  private threadMemory: Map<string, Record<string, string>> = new Map();
  private loaded = false;

  /** 初始化：从磁盘加载 */
  async init(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    fs.mkdirSync(THREADS_DIR, { recursive: true });
    fs.mkdirSync(MEMORY_DIR, { recursive: true });

    // 加载线程索引
    const indexPath = path.join(THREADS_DIR, "index.json");
    const threadList = readJSON<ThreadMeta[]>(indexPath, []);
    for (const t of threadList) {
      this.threads.set(t.id, t);
    }

    // 加载每个线程的消息
    for (const t of threadList) {
      const msgPath = path.join(THREADS_DIR, `${t.id}.json`);
      const msgs = readJSON<Message[]>(msgPath, []);
      this.messages.set(t.id, msgs);
    }

    // 加载长期记忆
    for (const agentId of ["sasaki", "bunzo", "kohana"]) {
      const memPath = path.join(MEMORY_DIR, `${agentId}.json`);
      const mem = readJSON<Record<string, string>>(memPath, {});
      if (Object.keys(mem).length > 0) {
        this.longMemory.set(agentId, mem);
      }
    }

    console.log(`[JsonFileStore] 已加载 ${this.threads.size} 个线程`);
  }

  private saveThreadIndex(): void {
    const list = [...this.threads.values()].sort(
      (a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0),
    );
    writeJSON(path.join(THREADS_DIR, "index.json"), list);
  }

  private saveThreadMessages(threadId: string): void {
    const msgs = this.messages.get(threadId);
    if (msgs) {
      writeJSON(path.join(THREADS_DIR, `${threadId}.json`), msgs);
    }
  }

  // ===== Thread =====

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
    const thread: ThreadMeta = {
      id: threadId,
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      ...meta,
    };
    this.threads.set(threadId, thread);
    this.messages.set(threadId, []);
    this.saveThreadIndex();
    this.saveThreadMessages(threadId);
  }

  async updateThread(threadId: string, meta: Partial<ThreadMeta>): Promise<void> {
    const existing = this.threads.get(threadId);
    if (!existing) return;
    this.threads.set(threadId, { ...existing, ...meta, updatedAt: Date.now() });
    this.saveThreadIndex();
  }

  async deleteThread(threadId: string): Promise<void> {
    this.threads.delete(threadId);
    this.messages.delete(threadId);
    this.saveThreadIndex();
    // 删除消息文件
    const msgPath = path.join(THREADS_DIR, `${threadId}.json`);
    try { fs.unlinkSync(msgPath); } catch { /* ignore */ }
  }

  // ===== Messages =====

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
    // 更新线程元数据
    const thread = this.threads.get(msg.threadId);
    if (thread) {
      thread.lastActivity = full.timestamp;
      if (msg.role === "user" && !thread.title) {
        thread.title = msg.content.slice(0, 30) + (msg.content.length > 30 ? "..." : "");
      }
      thread.updatedAt = full.timestamp;
    }
    this.saveThreadMessages(msg.threadId);
    this.saveThreadIndex();
    return full;
  }

  // ===== Agents =====

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

  // ===== Memory =====

  async getLongMemory(agentId: string): Promise<Record<string, string>> {
    return this.longMemory.get(agentId) ?? {};
  }

  async setLongMemory(agentId: string, key: string, value: string): Promise<void> {
    const mem = this.longMemory.get(agentId) ?? {};
    mem[key] = value;
    this.longMemory.set(agentId, mem);
    writeJSON(path.join(MEMORY_DIR, `${agentId}.json`), mem);
  }

  async removeLongMemory(agentId: string, key: string): Promise<void> {
    const mem = this.longMemory.get(agentId);
    if (mem) {
      delete mem[key];
      writeJSON(path.join(MEMORY_DIR, `${agentId}.json`), mem);
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
    writeJSON(path.join(MEMORY_DIR, `thread-${threadId}-${agentId}.json`), mem);
  }
}
