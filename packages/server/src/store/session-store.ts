/**
 * Agent Session 持久化
 *
 * 保存每个 (agentId, threadId) 的 CLI sessionId，
 * 重启后用 --resume 恢复上下文，保持对话记忆。
 *
 * 文件: data/sessions.json
 * 格式: { "agentId:threadId": "cli-session-uuid" }
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");

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
