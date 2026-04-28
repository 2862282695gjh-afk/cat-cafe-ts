/**
 * 记忆系统接口
 *
 * 支持两层记忆：长期记忆（Agent 级别）和房间记忆（Thread 级别）。
 */

export interface MemoryStore {
  /** 长期记忆 */
  getLongMemory(agentId: string): Promise<Record<string, string>>;
  setLongMemory(agentId: string, key: string, value: string): Promise<void>;
  removeLongMemory(agentId: string, key: string): Promise<void>;

  /** 房间记忆（per thread + agent） */
  getThreadMemory(threadId: string, agentId: string): Promise<Record<string, string>>;
  setThreadMemory(threadId: string, agentId: string, key: string, value: string): Promise<void>;
  removeThreadMemory(threadId: string, agentId: string, key: string): Promise<void>;
}
