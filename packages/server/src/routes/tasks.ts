/**
 * 任务看板 API — 猫咪通过 curl 创建/完成任务
 *
 * POST   /api/tasks                    — 创建任务
 * GET    /api/tasks?threadId=xxx        — 获取看板
 * PATCH  /api/tasks/:id/start          — 开始任务
 * PATCH  /api/tasks/:id/complete       — 完成任务
 */
import type { FastifyInstance } from "fastify";
import type { TaskBoardStore } from "../store/task-board-store.js";
import type { Server } from "socket.io";

let io: Server | null = null;

export function setTaskIo(socketIo: Server) {
  io = socketIo;
}

async function broadcastBoard(store: TaskBoardStore, threadId: string) {
  if (!io) return;
  const tasks = await store.getBoard(threadId);
  io.to(threadId).emit("task-board", tasks);
}

export function taskRoutes(fastify: FastifyInstance, store: TaskBoardStore) {
  // POST /api/tasks — 创建任务
  fastify.post("/api/tasks", async (req) => {
    const { threadId, title, description, createdBy, createdByName, assignee, assigneeName } = req.body as {
      threadId: string;
      title: string;
      description?: string;
      createdBy: string;
      createdByName: string;
      assignee?: string;
      assigneeName?: string;
    };
    if (!threadId || !title) return { error: "threadId 和 title 必填" };

    const task = await store.createTask({
      threadId, title, description,
      createdBy: createdBy || "unknown",
      createdByName: createdByName || "未知",
      assignee, assigneeName,
    });

    console.log(`[API] task created: ${task.id} "${title}" by ${createdByName} → ${assigneeName ?? "未分配"}`);
    broadcastBoard(store, threadId);
    return task;
  });

  // GET /api/tasks?threadId=xxx — 获取看板
  fastify.get<{ Querystring: { threadId?: string } }>("/api/tasks", async (req) => {
    if (!req.query.threadId) return { error: "threadId 必填" };
    return store.getBoard(req.query.threadId);
  });

  // PATCH /api/tasks/:id/start — 开始任务
  fastify.patch<{ Params: { id: string }; Body: { threadId: string } }>("/api/tasks/:id/start", async (req) => {
    const { threadId } = req.body;
    if (!threadId) return { error: "threadId 必填" };
    const task = await store.startTask(threadId, req.params.id);
    if (!task) return { error: "任务不存在" };
    broadcastBoard(store, threadId);
    return task;
  });

  // PATCH /api/tasks/:id/complete — 完成任务
  fastify.patch<{ Params: { id: string }; Body: { threadId: string } }>("/api/tasks/:id/complete", async (req) => {
    const { threadId } = req.body;
    if (!threadId) return { error: "threadId 必填" };
    const task = await store.completeTask(threadId, req.params.id);
    if (!task) return { error: "任务不存在" };
    broadcastBoard(store, threadId);
    return task;
  });
}
