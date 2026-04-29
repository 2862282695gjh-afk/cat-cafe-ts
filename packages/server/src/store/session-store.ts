/**
 * Agent Session 持久化
 *
 * 保存每个 (agentId, threadId) 的 CLI sessionId，
 * 重启后用 --resume 恢复上下文，保持对话记忆。
 *
 * 文件: data/sessions.json
 * 格式: { "agentId:threadId": "cli-session-uuid" }
 *
 * Session Chain: data/chains/{threadId}/{agentId}.json
 * 记录每只猫在每个线程的多代 session 历史。
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const CHAINS_DIR = path.join(DATA_DIR, "chains");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");

// ========== Session ID 存储 ==========

let cache: Record<string, string> = {};

export function loadSessions(): void {
  try {
    cache = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
    console.log(`[SessionStore] 已加载 ${Object.keys(cache).length} 个 session`);
  } catch {
    cache = {};
  }
}

export function getSessionId(agentId: string, threadId: string): string | null {
  return cache[`${agentId}:${threadId}`] ?? null;
}

export function saveSessionId(agentId: string, threadId: string, sessionId: string): void {
  const key = `${agentId}:${threadId}`;
  cache[key] = sessionId;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

// ========== Session Chain 存储 ==========

export interface SessionRecord {
  sessionId: string;
  generation: number;
  status: "active" | "sealed";
  sealedAt?: number;
  fillRatio: number;
  digest?: string;
}

function chainPath(threadId: string, agentId: string): string {
  return path.join(CHAINS_DIR, threadId, `${agentId}.json`);
}

export function loadChain(threadId: string, agentId: string): SessionRecord[] {
  try {
    const raw = fs.readFileSync(chainPath(threadId, agentId), "utf-8");
    return JSON.parse(raw) as SessionRecord[];
  } catch {
    return [];
  }
}

export function saveChain(threadId: string, agentId: string, records: SessionRecord[]): void {
  const filePath = chainPath(threadId, agentId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
}

export function getActiveSessionRecord(threadId: string, agentId: string): SessionRecord | null {
  const chain = loadChain(threadId, agentId);
  return chain.find((r) => r.status === "active") ?? null;
}
