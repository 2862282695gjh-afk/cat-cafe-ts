/**
 * 存储接口定义
 *
 * 对应 cat-noodle-python 中 RedisStorage / MemoryStorage 的抽象。
 */

export interface ThreadMeta {
  id: string;
  title?: string;
  projectId?: string;
  createdAt?: number;
  updatedAt?: number;
  lastActivity?: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt?: number;
}

export interface Message {
  id: string;
  threadId: string;
  agentId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  processLogs?: Array<{ type: string; [key: string]: unknown }>;
}

export interface AgentConfig {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  voice: { pitch: number; rate: number; description: string };
  type: string;
}

export interface Store {
  // Thread
  getThreads(): Promise<ThreadMeta[]>;
  getThread(threadId: string): Promise<ThreadMeta | null>;
  createThread(threadId: string, meta?: Partial<ThreadMeta>): Promise<void>;
  updateThread(threadId: string, meta: Partial<ThreadMeta>): Promise<void>;
  deleteThread(threadId: string): Promise<void>;

  // Messages
  getMessages(threadId: string): Promise<Message[]>;
  saveMessage(msg: Omit<Message, "id" | "timestamp">): Promise<Message>;

  // Agents
  getAgents(): Promise<AgentConfig[]>;
  getAgent(agentId: string): Promise<AgentConfig | null>;
  saveAgent(config: AgentConfig): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;

  // Memory
  getLongMemory(agentId: string): Promise<Record<string, string>>;
  setLongMemory(agentId: string, key: string, value: string): Promise<void>;
  removeLongMemory(agentId: string, key: string): Promise<void>;
  getThreadMemory(threadId: string, agentId: string): Promise<Record<string, string>>;
  setThreadMemory(threadId: string, agentId: string, key: string, value: string): Promise<void>;
}
