/**
 * Session Search 路由测试
 *
 * 测试 /api/sessions/* 4 个端点的核心逻辑。
 * mock session-store 的文件系统依赖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock session-store
const mockLoadChain = vi.fn().mockReturnValue([]);
const mockSearchChainSessions = vi.fn().mockResolvedValue([]);
const mockReadSessionEvents = vi.fn().mockResolvedValue([]);
const mockFindSessionDigest = vi.fn().mockReturnValue(null);
const mockFindSessionOwner = vi.fn().mockResolvedValue(null);
const mockReadSessionTranscript = vi.fn().mockResolvedValue([]);

vi.mock("../store/session-store.js", () => ({
  loadChain: (...args: unknown[]) => mockLoadChain(...args),
  searchChainSessions: (...args: unknown[]) => mockSearchChainSessions(...args),
  readSessionEvents: (...args: unknown[]) => mockReadSessionEvents(...args),
  findSessionDigest: (...args: unknown[]) => mockFindSessionDigest(...args),
  findSessionOwner: (...args: unknown[]) => mockFindSessionOwner(...args),
  readSessionTranscript: (...args: unknown[]) => mockReadSessionTranscript(...args),
}));

import Fastify from "fastify";
import { sessionRoutes } from "./sessions.js";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  sessionRoutes(app);
  return app;
}

describe("Session Search Routes", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/sessions/chain", () => {
    it("缺少参数时应返回错误", async () => {
      app = await buildApp();
      const res = await app.inject({ method: "GET", url: "/api/sessions/chain" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ error: "threadId and agentId are required" });
    });

    it("有参数时返回 chain 记录", async () => {
      mockLoadChain.mockReturnValue([
        { sessionId: "s1", generation: 1, status: "sealed", sealedAt: 1000, fillRatio: 0.85, digest: "摘要1" },
        { sessionId: "s2", generation: 2, status: "active", fillRatio: 0 },
      ]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/chain?threadId=t1&agentId=sasaki",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.threadId).toBe("t1");
      expect(body.agentId).toBe("sasaki");
      expect(body.generations).toBe(2);
      expect(body.chain).toHaveLength(2);
      expect(body.chain[0].hasDigest).toBe(true);
      expect(body.chain[1].hasDigest).toBe(false);
    });

    it("空 chain 应返回空数组", async () => {
      mockLoadChain.mockReturnValue([]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/chain?threadId=empty&agentId=bunzo",
      });
      expect(res.json().generations).toBe(0);
      expect(res.json().chain).toEqual([]);
    });
  });

  describe("GET /api/sessions/search", () => {
    it("缺少参数时应返回错误", async () => {
      app = await buildApp();
      const res = await app.inject({ method: "GET", url: "/api/sessions/search?q=test" });
      expect(res.json()).toEqual({ error: "threadId, agentId, and q are required" });
    });

    it("搜索应返回匹配结果", async () => {
      mockSearchChainSessions.mockResolvedValue([
        {
          sessionId: "s1",
          generation: 1,
          matches: [
            { role: "user" as const, content: "修复了登录 bug", snippet: "...修复了登录 bug..." },
          ],
        },
      ]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/search?threadId=t1&agentId=sasaki&q=登录",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.query).toBe("登录");
      expect(body.totalSessions).toBe(1);
      expect(body.totalMatches).toBe(1);
      expect(body.results[0].matches[0].snippet).toContain("登录");
    });

    it("无匹配时应返回空结果", async () => {
      mockSearchChainSessions.mockResolvedValue([]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/search?threadId=t1&agentId=sasaki&q=不存在",
      });
      expect(res.json().totalSessions).toBe(0);
      expect(res.json().totalMatches).toBe(0);
    });
  });

  describe("GET /api/sessions/:sessionId/events", () => {
    it("无事件时应返回空数组", async () => {
      mockReadSessionEvents.mockResolvedValue([]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/nonexistent/events",
      });
      expect(res.json()).toEqual({ sessionId: "nonexistent", events: [], count: 0 });
    });

    it("有事件时应返回事件列表", async () => {
      mockReadSessionEvents.mockResolvedValue([
        { type: "user", role: "user", content: "帮我写代码" },
        { type: "assistant", role: "assistant", content: "好的，我来帮你" },
        { type: "tool_use", content: '{"name":"Write","input":{}}' },
      ]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/sess-123/events",
      });
      expect(res.json().count).toBe(3);
      expect(res.json().events[0].content).toBe("帮我写代码");
    });
  });

  describe("GET /api/sessions/:sessionId/digest", () => {
    it("有 threadId/agentId 时直接从 chain 查找 digest", async () => {
      mockFindSessionDigest.mockReturnValue("这是第 1 代摘要");
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/s1/digest?threadId=t1&agentId=sasaki",
      });
      expect(res.json().digest).toBe("这是第 1 代摘要");
    });

    it("无 digest 时返回 transcriptPreview", async () => {
      mockFindSessionDigest.mockReturnValue(null);
      mockFindSessionOwner.mockResolvedValue(null);
      mockReadSessionTranscript.mockResolvedValue([
        { role: "user", content: "第一条消息" },
        { role: "assistant", content: "第二条消息" },
      ]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/s2/digest",
      });
      const body = res.json();
      expect(body.digest).toBeNull();
      expect(body.transcriptPreview).toHaveLength(2);
      expect(body.totalMessages).toBe(2);
    });

    it("无 transcript 时返回 not found", async () => {
      mockFindSessionDigest.mockReturnValue(null);
      mockFindSessionOwner.mockResolvedValue(null);
      mockReadSessionTranscript.mockResolvedValue([]);
      app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/nope/digest",
      });
      expect(res.json().error).toContain("not found");
    });
  });
});
