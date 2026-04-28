/**
 * Agent 路由
 */
import type { FastifyInstance } from "fastify";
import { pool, agentStatus, agentConfigs } from "../pool.js";

export function agentRoutes(fastify: FastifyInstance) {
  // GET /api/agents — 列出可用 Agent
  fastify.get("/api/agents", async () => {
    return pool.agentIds.map((id) => {
      const config = agentConfigs[id];
      return {
        id,
        name: config?.name ?? id,
        avatar: config?.avatar ?? "🐱",
        description: config?.description ?? "",
      };
    });
  });

  // GET /api/agents/status — 获取 Agent 状态详情
  fastify.get("/api/agents/status", async () => {
    const status: Record<string, unknown> = {};
    for (const [id, s] of agentStatus) {
      const config = agentConfigs[id];
      status[id] = {
        id,
        name: config?.name ?? id,
        avatar: config?.avatar ?? "🐱",
        status: s.status,
        statusMessage: s.message,
      };
    }
    return status;
  });
}
