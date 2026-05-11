/**
 * Wiki 知识库 — Agent 可主动查询的文档检索系统
 *
 * 数据源：
 *   1. 所有项目的 cat_readme.md（项目级知识）
 *   2. 线程的 project-doc（任务级知识）
 *
 * Agent 通过 curl 调用 /api/wiki/* 查询，而不是被动接收全量注入。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "./interface.js";
import type { ProjectStore } from "./project-store.js";
import type { ProjectDocStore } from "./project-doc-store.js";

export interface WikiSearchResult {
  projectId: string;
  projectName: string;
  section: string;
  content: string;
  relevance: number; // 0-1
}

interface DocSection {
  level: number;
  title: string;
  titleText: string;
  content: string;
  lines: string[];
}

function parseMdSections(md: string): DocSection[] {
  const lines = md.split("\n");
  const sections: DocSection[] = [];
  let current: DocSection = { level: 0, title: "", titleText: "", content: "", lines: [] };

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) {
      current = { level: m[1].length, title: line, titleText: m[2].trim(), content: "", lines: [] };
      sections.push(current);
    } else {
      current.content += (current.content ? "\n" : "") + line;
      current.lines.push(line);
    }
  }
  return sections;
}

/** 简易关键词匹配评分（无需 embedding） */
function scoreRelevance(query: string, text: string): number {
  const qLower = query.toLowerCase();
  const terms = qLower.split(/[\s,，、]+/).filter(Boolean);
  const tLower = text.toLowerCase();

  // 完全匹配最高分
  if (tLower.includes(qLower)) return 1.0;

  // 多词匹配加权
  let matched = 0;
  for (const term of terms) {
    if (tLower.includes(term)) matched++;
  }
  if (terms.length === 0) return 0;
  return matched / terms.length;
}

export class WikiStore {
  private projectStore: ProjectStore;
  private projectDocStore: ProjectDocStore;
  private sectionCache = new Map<string, DocSection[]>(); // key: projectId or thread:{threadId}
  private cacheTime = 0;
  private TTL = 30_000; // 30s cache

  constructor(projectStore: ProjectStore, projectDocStore: ProjectDocStore) {
    this.projectStore = projectStore;
    this.projectDocStore = projectDocStore;
  }

  /** 搜索所有项目文档 */
  async search(query: string, options?: { projectId?: string }): Promise<WikiSearchResult[]> {
    await this.ensureCache();
    const results: WikiSearchResult[] = [];

    for (const [key, sections] of this.sectionCache) {
      if (key.startsWith("thread:")) continue; // thread docs searched separately
      if (options?.projectId && key !== options.projectId) continue;

      const project = await this.projectStore.getProject(key);
      const projectName = project?.name ?? key;

      for (const sec of sections) {
        if (!sec.titleText && !sec.content.trim()) continue;
        const text = sec.title + "\n" + sec.content;
        const relevance = scoreRelevance(query, text);
        if (relevance > 0) {
          results.push({
            projectId: key,
            projectName,
            section: sec.titleText || "(概要)",
            content: text.trim(),
            relevance,
          });
        }
      }
    }

    // 按相关度排序，返回 top 10
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, 10);
  }

  /** 获取项目文档的某个章节 */
  async getSection(projectId: string, sectionTitle: string): Promise<string | null> {
    await this.ensureCache();
    const sections = this.sectionCache.get(projectId);
    if (!sections) return null;

    const q = sectionTitle.toLowerCase();
    for (const sec of sections) {
      if (sec.titleText.toLowerCase().includes(q)) {
        return (sec.title + "\n" + sec.content).trim();
      }
    }
    return null;
  }

  /** 获取项目文档全文 */
  async getFullDoc(projectId: string): Promise<string | null> {
    const project = await this.projectStore.getProject(projectId);
    if (!project?.catReadmePath) return null;
    try {
      return await readFile(project.catReadmePath, "utf-8");
    } catch {
      return null;
    }
  }

  /** 列出所有有文档的项目 */
  async listProjectsWithDocs(): Promise<Array<Project & { docSections: string[] }>> {
    const projects = await this.projectStore.listProjects();
    const result: Array<Project & { docSections: string[] }> = [];

    for (const p of projects) {
      if (!p.catReadmePath) continue;
      try {
        const content = await readFile(p.catReadmePath, "utf-8");
        const sections = parseMdSections(content);
        result.push({
          ...p,
          docSections: sections.filter((s) => s.titleText).map((s) => s.titleText),
        });
      } catch {
        // doc doesn't exist yet
      }
    }
    return result;
  }

  /** 强制刷新缓存（文档更新后调用） */
  invalidateCache(): void {
    this.sectionCache.clear();
    this.cacheTime = 0;
  }

  private async ensureCache(): Promise<void> {
    if (Date.now() - this.cacheTime < this.TTL && this.sectionCache.size > 0) return;

    const projects = await this.projectStore.listProjects();
    for (const p of projects) {
      if (!p.catReadmePath) continue;
      try {
        const content = await readFile(p.catReadmePath, "utf-8");
        this.sectionCache.set(p.id, parseMdSections(content));
      } catch {
        this.sectionCache.delete(p.id);
      }
    }
    this.cacheTime = Date.now();
  }
}
