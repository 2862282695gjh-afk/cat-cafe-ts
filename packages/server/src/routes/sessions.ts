/**
 * Session Search 路由
 *
 * 让 agent（通过 curl）和外部工具查询历史 session：
 * - chain：查看 session chain 历史
 * - search：关键词搜索历史 session 转录
 * - events：读取指定 session 完整事件
 * - digest：获取指定 session 的摘要
 */
import type { FastifyInstance } from "fastify";
import {
  loadChain,
  readSessionTranscript,
  readSessionEvents,
  searchChainSessions,
  findSessionDigest,
  findSessionOwner,
} from "../store/session-store.js";

export function sessionRoutes(fastify: FastifyInstance) {
  // GET /api/sessions/chain — 列出 session chain 历史
  fastify.get<{
    Querystring: { threadId: string; agentId: string };
  }>("/api/sessions/chain", async (req) => {
    const { threadId, agentId } = req.query;
    if (!threadId || !agentId) {
      return { error: "threadId and agentId are required" };
    }

    const chain = loadChain(threadId, agentId);
    return {
      threadId,
      agentId,
      generations: chain.length,
      chain: chain.map((r) => ({
        sessionId: r.sessionId,
        generation: r.generation,
        status: r.status,
        sealedAt: r.sealedAt,
        fillRatio: r.fillRatio,
        hasDigest: !!r.digest,
      })),
    };
  });

  // GET /api/sessions/search — 关键词搜索历史 session 转录
  fastify.get<{
    Querystring: { threadId: string; agentId: string; q: string };
  }>("/api/sessions/search", async (req) => {
    const { threadId, agentId, q } = req.query;
    if (!threadId || !agentId || !q) {
      return { error: "threadId, agentId, and q are required" };
    }

    const results = await searchChainSessions(threadId, agentId, q);
    return {
      query: q,
      totalSessions: results.length,
      totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
      results,
    };
  });

  // GET /api/sessions/:sessionId/events — 读取指定 session 的完整事件
  fastify.get<{
    Params: { sessionId: string };
    Querystring: { threadId?: string; agentId?: string };
  }>("/api/sessions/:sessionId/events", async (req) => {
    const { sessionId } = req.params;
    const { threadId, agentId } = req.query;

    // 如果提供了 threadId/agentId，直接读取
    // 否则先尝试通过 events 端点（不依赖 chain 定位）
    const events = await readSessionEvents(sessionId);
    if (events.length === 0) {
      return { sessionId, events: [], count: 0 };
    }

    return {
      sessionId,
      count: events.length,
      events,
    };
  });

  // GET /api/sessions/:sessionId/digest — 获取指定 session 的摘要
  fastify.get<{
    Params: { sessionId: string };
    Querystring: { threadId?: string; agentId?: string };
  }>("/api/sessions/:sessionId/digest", async (req) => {
    const { sessionId } = req.params;
    const { threadId, agentId } = req.query;

    // 如果提供了 threadId/agentId，直接从 chain 查找
    if (threadId && agentId) {
      const digest = findSessionDigest(threadId, agentId, sessionId);
      if (digest !== null) {
        return { sessionId, digest };
      }
    }

    // 兜底：遍历所有 chain 文件查找
    const owner = await findSessionOwner(sessionId);
    if (owner && owner.record.digest) {
      return { sessionId, digest: owner.record.digest };
    }

    // 最后尝试读取 transcript 生成简要总结
    const transcript = await readSessionTranscript(sessionId);
    if (transcript.length === 0) {
      return { sessionId, digest: null, error: "session not found or has no transcript" };
    }

    // 返回前 5 条消息作为简要内容
    const preview = transcript.slice(0, 5).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 300),
    }));

    return {
      sessionId,
      digest: null,
      transcriptPreview: preview,
      totalMessages: transcript.length,
    };
  });
}
