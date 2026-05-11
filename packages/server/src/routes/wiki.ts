/**
 * Wiki API — Agent 通过 curl 查询项目文档
 *
 * GET /api/wiki/search?q=keyword[&project=projectId]
 * GET /api/wiki/projects
 * GET /api/wiki/project/:id
 * GET /api/wiki/section?project=projectId&title=sectionTitle
 */
import type { FastifyInstance } from "fastify";
import type { WikiStore } from "../store/wiki-store.js";

export function wikiRoutes(fastify: FastifyInstance, wiki: WikiStore) {
  // GET /api/wiki/search?q=xxx — 搜索文档
  fastify.get<{ Querystring: { q?: string; project?: string } }>("/api/wiki/search", async (req) => {
    const { q, project } = req.query;
    if (!q) return { results: [], hint: "请提供 q 参数，如 /api/wiki/search?q=API端点" };

    const results = await wiki.search(q, { projectId: project });
    return { query: q, count: results.length, results };
  });

  // GET /api/wiki/projects — 列出有文档的项目
  fastify.get("/api/wiki/projects", async () => {
    return wiki.listProjectsWithDocs();
  });

  // GET /api/wiki/project/:id — 获取项目文档全文
  fastify.get<{ Params: { id: string } }>("/api/wiki/project/:id", async (req) => {
    const doc = await wiki.getFullDoc(req.params.id);
    if (!doc) return { error: "项目文档不存在" };
    return { projectId: req.params.id, content: doc };
  });

  // GET /api/wiki/section?project=xxx&title=xxx — 获取特定章节
  fastify.get<{ Querystring: { project?: string; title?: string } }>("/api/wiki/section", async (req) => {
    const { project, title } = req.query;
    if (!project || !title) return { error: "project 和 title 参数必填" };
    const content = await wiki.getSection(project, title);
    if (!content) return { error: "章节不存在" };
    return { project, section: title, content };
  });
}
