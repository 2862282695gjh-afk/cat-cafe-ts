/**
 * 项目路由
 *
 * CRUD for projects — 每个项目对应一个工作目录。
 */
import type { FastifyInstance } from "fastify";
import { ProjectStore } from "../store/project-store.js";

export function projectRoutes(fastify: FastifyInstance, store: ProjectStore) {
  // GET /api/projects — 列出所有项目
  fastify.get("/api/projects", async () => {
    return store.listProjects();
  });

  // POST /api/projects — 创建项目
  fastify.post("/api/projects", async (req) => {
    const { name, path, description } = req.body as { name: string; path: string; description?: string };
    if (!name || !path) return { error: "name 和 path 必填" };
    return store.createProject({ name, path, description });
  });

  // GET /api/projects/:id — 获取项目详情
  fastify.get<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const project = await store.getProject(req.params.id);
    if (!project) return { error: "项目不存在" };
    return project;
  });

  // PATCH /api/projects/:id — 更新项目
  fastify.patch<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const { name, path, description } = req.body as { name?: string; path?: string; description?: string };
    return store.updateProject(req.params.id, { name, path, description });
  });

  // DELETE /api/projects/:id — 删除项目
  fastify.delete<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const ok = await store.deleteProject(req.params.id);
    return { status: ok ? "deleted" : "not found" };
  });
}
