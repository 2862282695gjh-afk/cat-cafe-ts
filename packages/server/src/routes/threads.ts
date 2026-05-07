/**
 * 线程路由
 */
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/interface.js";

export function threadRoutes(fastify: FastifyInstance, store: Store) {
  // GET /api/threads — 列出所有线程
  fastify.get("/api/threads", async () => {
    return store.getThreads();
  });

  // POST /api/threads — 创建线程
  fastify.post("/api/threads", async (req) => {
    const { title, projectId } = req.body as { title?: string; projectId?: string };
    const id = crypto.randomUUID();
    const meta: Record<string, string> = {};
    if (title) meta.title = title;
    if (projectId) meta.projectId = projectId;
    await store.createThread(id, Object.keys(meta).length > 0 ? meta : undefined);
    return { threadId: id };
  });

  // GET /api/threads/:id — 获取线程详情
  fastify.get<{ Params: { id: string } }>("/api/threads/:id", async (req) => {
    const meta = await store.getThread(req.params.id);
    if (!meta) return { error: "线程不存在" };
    const messages = await store.getMessages(req.params.id);
    return { ...meta, messages };
  });

  // PATCH /api/threads/:id — 更新线程
  fastify.patch<{ Params: { id: string } }>("/api/threads/:id", async (req) => {
    await store.updateThread(req.params.id, req.body as Record<string, unknown>);
    return { status: "updated" };
  });

  // DELETE /api/threads/:id — 删除线程
  fastify.delete<{ Params: { id: string } }>("/api/threads/:id", async (req) => {
    await store.deleteThread(req.params.id);
    return { status: "deleted" };
  });

  // GET /api/threads/:id/messages — 获取消息列表
  fastify.get<{ Params: { id: string } }>("/api/threads/:id/messages", async (req) => {
    return store.getMessages(req.params.id);
  });
}
