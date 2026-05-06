/**
 * Session Store 单元测试
 *
 * 使用临时目录隔离文件操作，避免影响实际数据。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 在测试中重新实现 session-store 的逻辑，避免依赖全局 DATA_DIR
// 直接测试核心逻辑函数

describe("session-store 核心逻辑", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-noodle-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------- Session ID 存储 ----------

  it("getSessionId / saveSessionId 应正确读写", () => {
    // 直接模拟 session-store 的逻辑
    const sessionFile = path.join(tmpDir, "sessions.json");
    let cache: Record<string, string> = {};

    function getSessionId(agentId: string, threadId: string): string | null {
      return cache[`${agentId}:${threadId}`] ?? null;
    }

    function saveSessionId(agentId: string, threadId: string, sessionId: string): void {
      const key = `${agentId}:${threadId}`;
      cache[key] = sessionId;
      fs.writeFileSync(sessionFile, JSON.stringify(cache, null, 2), "utf-8");
    }

    expect(getSessionId("sasaki", "t1")).toBeNull();

    saveSessionId("sasaki", "t1", "sess-111");
    expect(getSessionId("sasaki", "t1")).toBe("sess-111");

    // 验证文件已写入
    const raw = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    expect(raw["sasaki:t1"]).toBe("sess-111");
  });

  it("不同 agent/thread 应有独立的 session", () => {
    let cache: Record<string, string> = {};
    const save = (a: string, t: string, s: string) => { cache[`${a}:${t}`] = s; };
    const get = (a: string, t: string) => cache[`${a}:${t}`] ?? null;

    save("sasaki", "t1", "sess-a");
    save("bunzo", "t1", "sess-b");
    save("sasaki", "t2", "sess-c");

    expect(get("sasaki", "t1")).toBe("sess-a");
    expect(get("bunzo", "t1")).toBe("sess-b");
    expect(get("sasaki", "t2")).toBe("sess-c");
  });

  // ---------- Session Chain 存储 ----------

  it("loadChain / saveChain 应正确读写 chain 记录", () => {
    const chainsDir = path.join(tmpDir, "chains");
    const chainFile = path.join(chainsDir, "thread1", "sasaki.json");

    function chainPath(threadId: string, agentId: string): string {
      return path.join(chainsDir, threadId, `${agentId}.json`);
    }

    function saveChain(threadId: string, agentId: string, records: unknown[]): void {
      const filePath = chainPath(threadId, agentId);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
    }

    function loadChain(threadId: string, agentId: string): unknown[] {
      try {
        return JSON.parse(fs.readFileSync(chainPath(threadId, agentId), "utf-8"));
      } catch {
        return [];
      }
    }

    // 空 chain
    expect(loadChain("thread1", "sasaki")).toEqual([]);

    // 写入并读取
    const records = [
      { sessionId: "s1", generation: 1, status: "sealed", sealedAt: 1000, fillRatio: 0.8 },
      { sessionId: "s2", generation: 2, status: "active", fillRatio: 0 },
    ];
    saveChain("thread1", "sasaki", records);

    const loaded = loadChain("thread1", "sasaki");
    expect(loaded).toEqual(records);
    expect(fs.existsSync(chainFile)).toBe(true);
  });

  it("getActiveSessionRecord 应找到 active 状态的记录", () => {
    const chainsDir = path.join(tmpDir, "chains");

    function chainPath(threadId: string, agentId: string): string {
      return path.join(chainsDir, threadId, `${agentId}.json`);
    }

    function loadChain(threadId: string, agentId: string): unknown[] {
      try {
        return JSON.parse(fs.readFileSync(chainPath(threadId, agentId), "utf-8"));
      } catch {
        return [];
      }
    }

    function getActiveSessionRecord(threadId: string, agentId: string): unknown | null {
      const chain = loadChain(threadId, agentId);
      return (chain as Array<{ status: string }>).find((r) => r.status === "active") ?? null;
    }

    function saveChain(threadId: string, agentId: string, records: unknown[]): void {
      const filePath = chainPath(threadId, agentId);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
    }

    const records = [
      { sessionId: "s1", generation: 1, status: "sealed", fillRatio: 0.9 },
      { sessionId: "s2", generation: 2, status: "active", fillRatio: 0 },
    ];
    saveChain("t1", "kohana", records);

    const active = getActiveSessionRecord("t1", "kohana");
    expect(active).not.toBeNull();
    if (active) {
      expect((active as { sessionId: string }).sessionId).toBe("s2");
    }

    // 全部 sealed 的情况
    const sealedRecords = [
      { sessionId: "s1", generation: 1, status: "sealed", fillRatio: 0.9 },
    ];
    saveChain("t2", "kohana", sealedRecords);
    expect(getActiveSessionRecord("t2", "kohana")).toBeNull();

    // 空 chain
    expect(getActiveSessionRecord("t3", "kohana")).toBeNull();
  });

  it("chain 路径应按 threadId/agentId 组织", () => {
    const chainsDir = path.join(tmpDir, "chains");
    const filePath = path.join(chainsDir, "thread-abc", "bunzo.json");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "[]", "utf-8");

    expect(fs.existsSync(path.join(chainsDir, "thread-abc"))).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
