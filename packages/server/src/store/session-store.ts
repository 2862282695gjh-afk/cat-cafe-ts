/**
 * Agent Session 持久化 + Session Search
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
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const DATA_DIR = path.resolve("data");
const CHAINS_DIR = path.join(DATA_DIR, "chains");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");

// ========== Session Transcript 类型 ==========

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionEvent {
  type: string;
  role?: "user" | "assistant";
  content: string;
}

export interface SearchResult {
  sessionId: string;
  generation: number;
  matches: Array<{ role: "user" | "assistant"; content: string; snippet: string }>;
}

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

// ========== Session Transcript 读取 ==========

const CLAUDE_DIR = path.join(homedir(), ".claude", "projects");

/** 读取 session JSONL 文件中的对话历史 */
export async function readSessionTranscript(sessionId: string): Promise<SessionMessage[]> {
  let dirNames: string[];
  try {
    dirNames = await readdir(CLAUDE_DIR);
  } catch {
    return [];
  }

  for (const name of dirNames) {
    const filePath = path.join(CLAUDE_DIR, name, `${sessionId}.jsonl`);
    try {
      const raw = await readFile(filePath, "utf-8");
      return parseSessionJsonl(raw);
    } catch {
      // 文件不存在，尝试下一个目录
    }
  }

  return [];
}

/** 读取 session JSONL 文件中的完整事件（含 tool_use 等） */
export async function readSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  let dirNames: string[];
  try {
    dirNames = await readdir(CLAUDE_DIR);
  } catch {
    return [];
  }

  for (const name of dirNames) {
    const filePath = path.join(CLAUDE_DIR, name, `${sessionId}.jsonl`);
    try {
      const raw = await readFile(filePath, "utf-8");
      return parseSessionJsonlFull(raw);
    } catch {
      // 文件不存在
    }
  }

  return [];
}

/** 解析 JSONL，提取 user/assistant 消息 */
export function parseSessionJsonl(raw: string): SessionMessage[] {
  const messages: SessionMessage[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const type = obj.type;

      if (type === "user") {
        const content = extractText(obj.message?.content);
        if (content) messages.push({ role: "user", content });
      } else if (type === "assistant") {
        const content = extractText(obj.message?.content);
        if (content) messages.push({ role: "assistant", content });
      }
    } catch {
      // 跳过无法解析的行
    }
  }

  return messages;
}

/** 解析 JSONL，提取所有事件类型（含 tool_use） */
export function parseSessionJsonlFull(raw: string): SessionEvent[] {
  const events: SessionEvent[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const type = obj.type;

      if (type === "user") {
        const content = extractText(obj.message?.content);
        if (content) events.push({ type: "user", role: "user", content });
      } else if (type === "assistant") {
        const content = extractText(obj.message?.content);
        if (content) events.push({ type: "assistant", role: "assistant", content });
      } else if (type === "tool_use" || type === "tool_result") {
        events.push({
          type,
          content: JSON.stringify(obj, null, 2).slice(0, 2000),
        });
      }
    } catch {
      // 跳过
    }
  }

  return events;
}

/** 从 content 中提取纯文本 */
export function extractText(content: unknown): string {
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

// ========== Session Search ==========

/** 关键词搜索 chain 中所有 sealed session 的转录 */
export async function searchChainSessions(
  threadId: string,
  agentId: string,
  query: string,
): Promise<SearchResult[]> {
  const chain = loadChain(threadId, agentId);
  const sealedSessions = chain.filter((r) => r.status === "sealed");
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const record of sealedSessions) {
    const transcript = await readSessionTranscript(record.sessionId);
    const matches: SearchResult["matches"] = [];

    for (const msg of transcript) {
      if (msg.content.toLowerCase().includes(lowerQuery)) {
        // 截取关键词前后各 100 字符作为 snippet
        const idx = msg.content.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 100);
        const end = Math.min(msg.content.length, idx + query.length + 100);
        const snippet = (start > 0 ? "..." : "") + msg.content.slice(start, end) + (end < msg.content.length ? "..." : "");
        matches.push({ role: msg.role, content: msg.content, snippet });
      }
    }

    if (matches.length > 0) {
      results.push({
        sessionId: record.sessionId,
        generation: record.generation,
        matches: matches.slice(0, 10), // 每个 session 最多返回 10 条匹配
      });
    }
  }

  return results;
}

/** 从 chain 中查找指定 sessionId 的 digest */
export function findSessionDigest(threadId: string, agentId: string, sessionId: string): string | null {
  const chain = loadChain(threadId, agentId);
  const record = chain.find((r) => r.sessionId === sessionId);
  return record?.digest ?? null;
}

/** 从 chain 中查找指定 sessionId 所属的 thread/agent（遍历所有 chain 文件） */
export async function findSessionOwner(sessionId: string): Promise<{ threadId: string; agentId: string; record: SessionRecord } | null> {
  let chainDirs: string[];
  try {
    chainDirs = await readdir(CHAINS_DIR);
  } catch {
    return null;
  }

  for (const threadDir of chainDirs) {
    const threadPath = path.join(CHAINS_DIR, threadDir);
    let files: string[];
    try {
      files = await readdir(threadPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const agentId = file.replace(".json", "");
      const chain = loadChain(threadDir, agentId);
      const record = chain.find((r) => r.sessionId === sessionId);
      if (record) {
        return { threadId: threadDir, agentId, record };
      }
    }
  }

  return null;
}
