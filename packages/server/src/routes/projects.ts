/**
 * 项目路由
 *
 * CRUD for projects — 每个项目对应一个工作目录。
 */
import type { FastifyInstance } from "fastify";
import { ProjectStore } from "../store/project-store.js";
import type { Store } from "../store/interface.js";

export function projectRoutes(fastify: FastifyInstance, store: ProjectStore, threadStore?: Store) {
  // GET /api/projects — 列出所有项目
  fastify.get("/api/projects", async () => {
    return store.listProjects();
  });

  // GET /api/projects/by-path?path=xxx — 根据路径查找项目
  fastify.get<{ Querystring: { path: string } }>("/api/projects/by-path", async (req) => {
    if (!req.query.path) return { error: "path 参数必填" };
    const project = await store.findByPath(req.query.path);
    if (!project) return { error: "项目不存在" };
    return project;
  });

  // PATCH /api/projects/by-path?path=xxx — 根据路径更新项目（供 agent 调用）
  fastify.patch<{ Querystring: { path: string } }>("/api/projects/by-path", async (req) => {
    if (!req.query.path) return { error: "path 参数必填" };
    const project = await store.findByPath(req.query.path);
    if (!project) return { error: "项目不存在" };
    const { catReadmePath } = req.body as { catReadmePath?: string };
    return store.updateProject(project.id, { catReadmePath });
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
    const { name, path, description, catReadmePath } = req.body as { name?: string; path?: string; description?: string; catReadmePath?: string };
    return store.updateProject(req.params.id, { name, path, description, catReadmePath });
  });

  // DELETE /api/projects/:id — 删除项目
  fastify.delete<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    const ok = await store.deleteProject(req.params.id);
    return { status: ok ? "deleted" : "not found" };
  });

  // PATCH /api/projects/:id/readme — 更新 cat_readme 路径
  fastify.patch<{ Params: { id: string } }>("/api/projects/:id/readme", async (req) => {
    const { catReadmePath } = req.body as { catReadmePath: string };
    if (!catReadmePath) return { error: "catReadmePath 必填" };
    const project = await store.updateProject(req.params.id, { catReadmePath });
    if (!project) return { error: "项目不存在" };
    return project;
  });

  // POST /api/bind-doc — 萨布专用：更新 catReadmePath + 绑定 thread 到 project（自动创建项目）
  fastify.post("/api/bind-doc", async (req) => {
    const { threadId, projectPath, catReadmePath } = req.body as {
      threadId: string;
      projectPath: string;
      catReadmePath?: string;
    };
    if (!threadId || !projectPath) return { error: "threadId 和 projectPath 必填" };

    const normalizedPath = projectPath.replace(/\/$/, "");
    const readmePath = catReadmePath || `${normalizedPath}/cat_readme.md`;

    // 根据路径找项目，不存在则自动创建
    let project = await store.findByPath(normalizedPath);
    if (!project) {
      const dirName = normalizedPath.split("/").pop() || "未命名项目";
      project = await store.createProject({ name: dirName, path: normalizedPath });
      console.log(`[API] bind-doc: 自动创建项目 ${project.name} (${normalizedPath})`);
    }

    // 更新 catReadmePath
    await store.updateProject(project.id, { catReadmePath: readmePath });

    // 绑定 thread 到 project
    if (threadStore) {
      await threadStore.updateThread(threadId, { projectId: project.id });
    }

    console.log(`[API] bind-doc: thread=${threadId.slice(0, 8)} → project=${project.name}, readme=${readmePath}`);
    return { status: "ok", projectId: project.id, catReadmePath: readmePath };
  });
}
