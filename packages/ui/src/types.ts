export interface ThreadMeta {
  id: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  lastActivity?: number;
}

export interface ProcessLog {
  type: "thinking" | "tool";
  time: number;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface Message {
  id: string;
  threadId: string;
  agentId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  processLogs?: ProcessLog[];
}

export interface AgentStatus {
  id: string;
  name: string;
  avatar: string;
  status: string;
  statusMessage: string;
  currentTask?: string;
  pendingCount?: number;
}

export interface TaskQueueItem {
  id: string;
  from: string;
  summary: string;
  status: "pending" | "running";
  enqueuedAt: number;
}

export interface StreamEvent {
  type: string;
  threadId?: string;
  agentId?: string;
  text?: string;
  message?: string;
  response?: string;
  name?: string;
  input?: Record<string, unknown>;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
}
