/**
 * 线程项目文档存储
 *
 * 每个线程维护一份 project.md，记录代码结构、变更历史、任务进度。
 * Agent 执行前读取，完成后更新。
 *
 * 文件位置: data/threads/{threadId}-project.md
 */
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Agent 信息，用于模板生成 */
const AGENT_SECTIONS = [
  { id: "sasaki", name: "佐佐木", role: "前端" },
  { id: "bunzo", name: "文藏", role: "后端" },
  { id: "kohana", name: "小花", role: "测试" },
];

export class ProjectDocStore {
  private dir: string;
  private cache = new Map<string, string>();

  constructor(dir?: string) {
    this.dir = dir ?? join(process.cwd(), "data", "threads");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private filePath(threadId: string): string {
    return join(this.dir, `${threadId}-project.md`);
  }

  /** 读取项目文档 */
  async getDoc(threadId: string): Promise<string> {
    const cached = this.cache.get(threadId);
    if (cached !== undefined) return cached;

    try {
      const content = await readFile(this.filePath(threadId), "utf-8");
      this.cache.set(threadId, content);
      return content;
    } catch {
      return "";
    }
  }

  /** 保存项目文档 */
  async saveDoc(threadId: string, content: string): Promise<void> {
    this.cache.set(threadId, content);
    await writeFile(this.filePath(threadId), content, "utf-8");
  }

  /** 初始化模板（仅当文档不存在时） */
  async initDoc(threadId: string, title: string): Promise<void> {
    const existing = await this.getDoc(threadId);
    if (existing) return;

    const agentSections = AGENT_SECTIONS.map(
      (a) => `### ${a.name} (${a.id}) — ${a.role}\n\n> ${a.name}的工作区域`,
    ).join("\n\n");

    const taskSections = AGENT_SECTIONS.map(
      (a) => `### ${a.name} (${a.id})\n\n> 暂无任务`,
    ).join("\n\n");

    const template = `# 项目：${title || "新项目"}

## 项目范围

> 工作目录：${process.cwd()}
> 你只能操作当前项目目录内的文件。不要引用、不要 review、不要要求修改其他项目的文件。

## 代码结构

> 待补充

## Agent 职责区

${agentSections}

## 变更记录

> 暂无变更

## 任务跟踪

${taskSections}
`;

    await this.saveDoc(threadId, template);
  }

  /** 删除项目文档 */
  async deleteDoc(threadId: string): Promise<void> {
    this.cache.delete(threadId);
    try {
      await unlink(this.filePath(threadId));
    } catch {
      // ignore
    }
  }

  /**
   * 合并 agent 的更新到项目文档
   *
   * 策略：
   * - ## 级章节（如 "## 变更记录"）→ 替换整个章节
   * - ### 级小节（如 "### 佐佐木"）→ 替换文档中对应小节
   * - 特别：变更记录章节追加而非替换
   */
  async mergeUpdate(threadId: string, agentId: string, updateContent: string): Promise<void> {
    const existing = await this.getDoc(threadId);
    if (!existing) {
      // 文档不存在，直接用 update 作为完整内容（不太可能）
      await this.saveDoc(threadId, updateContent);
      return;
    }

    const merged = mergeSections(existing, updateContent);
    await this.saveDoc(threadId, merged);
  }
}

// ========== 章节合并逻辑 ==========

/** 解析 markdown 为有序的 section 列表 */
interface Section {
  level: number;        // heading level (1, 2, 3)
  title: string;        // heading 行（含 #）
  content: string;      // heading 下的内容（不含 heading 行本身）
}

function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [{ level: 0, title: "", content: "" }];
  let current = sections[0];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      current = {
        level: headingMatch[1].length,
        title: line,
        content: "",
      };
      sections.push(current);
    } else {
      current.content += (current.content ? "\n" : "") + line;
    }
  }

  return sections;
}

/** 组装 sections 为完整 markdown */
function assembleSections(sections: Section[]): string {
  return sections
    .map((s) => (s.title ? `${s.title}\n${s.content}` : s.content))
    .join("\n");
}

/**
 * 合并逻辑：
 * - update 中的 ## 级章节：
 *   - 如果是 "## 变更记录" → 将 update 中的内容追加到 existing 的变更记录末尾
 *   - 否则 → 替换 existing 中同名章节
 * - update 中的 ### 级小节 → 替换 existing 中同名小节
 */
function mergeSections(existing: string, update: string): string {
  const existingSections = parseSections(existing);
  const updateSections = parseSections(update);

  // 建立 existing 的标题索引
  const existingByTitle = new Map<string, number>();
  existingSections.forEach((s, i) => {
    if (s.title) existingByTitle.set(s.title, i);
  });

  // 判断是否为变更记录追加
  const changelogContent: string[] = [];

  for (const uSec of updateSections) {
    if (!uSec.title) continue;

    const isChangelog = uSec.title.includes("变更记录");
    const existingIdx = existingByTitle.get(uSec.title);

    if (isChangelog && uSec.content.trim()) {
      // 变更记录：追加
      changelogContent.push(uSec.content.trim());
    } else if (existingIdx !== undefined) {
      // 替换已有章节
      existingSections[existingIdx] = { ...uSec };
    } else {
      // 新章节，追加到末尾
      existingSections.push({ ...uSec });
    }
  }

  // 追加变更记录
  if (changelogContent.length > 0) {
    const changelogIdx = existingSections.findIndex((s) => s.title.includes("变更记录"));
    if (changelogIdx >= 0) {
      const sec = existingSections[changelogIdx];
      // 移除 "> 暂无变更" 占位符
      let base = sec.content.replace(/>\s*暂无变更\s*\n?/, "").trim();
      if (base) {
        base += "\n";
      }
      existingSections[changelogIdx] = {
        ...sec,
        content: base + "\n" + changelogContent.join("\n"),
      };
    }
  }

  return assembleSections(existingSections);
}
