/**
 * 线程项目文档存储（LLM Wiki 风格）
 *
 * 每个线程维护一组文件：
 *   {threadId}-project.md  — 主文档（结构化章节）
 *   {threadId}-log.md      — 追加式结构化时间线
 *   {threadId}-index.md    — 自动生成的索引/摘要
 *
 * Agent 注入策略：index + agent 相关章节 + 最近 log 条目（而非整篇文档）
 */
import { readFile, writeFile, appendFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Agent 信息，用于模板生成 */
const AGENT_SECTIONS = [
  { id: "sasaki", name: "佐佐木", role: "前端" },
  { id: "bunzo", name: "文藏", role: "后端" },
  { id: "kohana", name: "小花", role: "测试" },
];

/** Log 条目 */
export interface LogEntry {
  timestamp: string;   // ISO 格式
  agentId: string;
  agentName: string;
  action: string;      // 简短描述（≤100字）
  detail?: string;     // 可选详细说明
}

/** 解析后的章节 */
interface Section {
  level: number;
  title: string;       // 含 # 前缀
  content: string;     // heading 下的内容
  titleText: string;   // 不含 # 的纯标题文本
}

export class ProjectDocStore {
  private dir: string;
  private docCache = new Map<string, string>();

  constructor(dir?: string) {
    this.dir = dir ?? join(process.cwd(), "data", "threads");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  // ========== 文件路径 ==========

  private docPath(threadId: string): string {
    return join(this.dir, `${threadId}-project.md`);
  }

  private logPath(threadId: string): string {
    return join(this.dir, `${threadId}-log.md`);
  }

  private indexPath(threadId: string): string {
    return join(this.dir, `${threadId}-index.md`);
  }

  // ========== 主文档（project.md）==========

  /** 读取项目文档 */
  async getDoc(threadId: string): Promise<string> {
    const cached = this.docCache.get(threadId);
    if (cached !== undefined) return cached;

    try {
      const content = await readFile(this.docPath(threadId), "utf-8");
      this.docCache.set(threadId, content);
      return content;
    } catch {
      return "";
    }
  }

  /** 保存项目文档 */
  async saveDoc(threadId: string, content: string): Promise<void> {
    this.docCache.set(threadId, content);
    await writeFile(this.docPath(threadId), content, "utf-8");
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
    // 初始化 log
    await this.appendLogEntry(threadId, {
      timestamp: new Date().toISOString(),
      agentId: "system",
      agentName: "系统",
      action: `创建项目「${title || "新项目"}」`,
    });
  }

  /** 删除项目文档及相关文件 */
  async deleteDoc(threadId: string): Promise<void> {
    this.docCache.delete(threadId);
    for (const fn of [this.docPath(threadId), this.logPath(threadId), this.indexPath(threadId)]) {
      try { await unlink(fn); } catch { /* ignore */ }
    }
  }

  /**
   * 合并 agent 的更新到项目文档
   *
   * 策略：
   * - ## 级章节（如 "## 变更记录"）→ 替换整个章节
   * - ### 级小节（如 "### 佐佐木"）→ 替换文档中对应小节
   * - 变更记录章节追加而非替换
   * - 同时自动追加 log 条目
   */
  async mergeUpdate(threadId: string, agentId: string, updateContent: string): Promise<void> {
    const existing = await this.getDoc(threadId);
    if (!existing) {
      await this.saveDoc(threadId, updateContent);
      return;
    }

    const merged = mergeSections(existing, updateContent);
    await this.saveDoc(threadId, merged);

    // 从 update 中提取变更记录，追加到 log
    const changelogMatch = updateContent.match(/## 变更记录\n([\s\S]*?)(?=\n## |\n### |$)/);
    if (changelogMatch) {
      const agentName = AGENT_SECTIONS.find((a) => a.id === agentId)?.name ?? agentId;
      const changes = changelogMatch[1].trim();
      // 每行变更生成一个 log 条目
      const lines = changes.split("\n").filter((l) => l.trim() && !l.startsWith(">"));
      for (const line of lines) {
        const cleaned = line.replace(/^[-*]\s*/, "").trim();
        if (cleaned) {
          await this.appendLogEntry(threadId, {
            timestamp: new Date().toISOString(),
            agentId,
            agentName,
            action: cleaned.slice(0, 100),
            detail: cleaned.length > 100 ? cleaned : undefined,
          });
        }
      }
    }

    // 更新 index
    await this.rebuildIndex(threadId);
  }

  // ========== 结构化时间线（log.md）==========

  /** 追加一条 log 条目（并发安全：使用 appendFile 避免竞态） */
  async appendLogEntry(threadId: string, entry: LogEntry): Promise<void> {
    const logLine = `- [${entry.timestamp}] ${entry.agentName}(${entry.agentId}): ${entry.action}${entry.detail ? `\n  > ${entry.detail}` : ""}\n`;

    try {
      await readFile(this.logPath(threadId), "utf-8");
    } catch {
      // 文件不存在，先写入 header
      const header = `# 变更时间线\n\n> 结构化记录，按时间排序\n\n`;
      await writeFile(this.logPath(threadId), header, "utf-8");
    }
    await appendFile(this.logPath(threadId), logLine, "utf-8");
  }

  /** 读取 log（返回最近 N 条） */
  async getRecentLog(threadId: string, limit = 10): Promise<string> {
    try {
      const raw = await readFile(this.logPath(threadId), "utf-8");
      const lines = raw.split("\n").filter((l) => l.startsWith("- ["));
      const recent = lines.slice(-limit);
      if (recent.length === 0) return "";
      return `## 最近变更（${recent.length} 条）\n` + recent.join("\n");
    } catch {
      return "";
    }
  }

  // ========== 索引（index.md）==========

  /** 重建索引（基于主文档内容自动生成） */
  async rebuildIndex(threadId: string): Promise<void> {
    const doc = await this.getDoc(threadId);
    if (!doc) return;

    const sections = parseSections(doc);
    const indexLines: string[] = [`# 索引：项目概览\n`];

    // 提取项目标题
    const titleSection = sections.find((s) => s.level === 1);
    const projectTitle = titleSection?.titleText ?? "未命名项目";
    indexLines.push(`> ${projectTitle}\n`);

    // 统计各章节
    for (const sec of sections) {
      if (sec.level !== 2 || !sec.titleText) continue;
      const contentPreview = sec.content.trim().split("\n").filter((l) => !l.startsWith(">")).slice(0, 2).join(" | ");
      const preview = contentPreview.length > 80 ? contentPreview.slice(0, 80) + "…" : contentPreview;
      indexLines.push(`- **${sec.titleText}**${preview ? `：${preview}` : ""}`);
    }

    // 统计任务状态
    const taskSection = sections.find((s) => s.titleText?.includes("任务跟踪"));
    if (taskSection) {
      const todoCount = (taskSection.content.match(/^[-*] \[[ xX]\]/gm) || []).length;
      const doneCount = (taskSection.content.match(/^[-*] \[[xX]\]/gm) || []).length;
      indexLines.push(`\n> 任务进度：${doneCount}/${todoCount + doneCount} 完成`);
    }

    await writeFile(this.indexPath(threadId), indexLines.join("\n"), "utf-8");
  }

  /** 读取索引 */
  async getIndex(threadId: string): Promise<string> {
    try {
      return await readFile(this.indexPath(threadId), "utf-8");
    } catch {
      // 自动生成
      await this.rebuildIndex(threadId);
      try {
        return await readFile(this.indexPath(threadId), "utf-8");
      } catch {
        return "";
      }
    }
  }

  // ========== 智能注入：返回 agent 相关的章节 + 索引 ==========

  /**
   * 获取与指定 agent 相关的文档内容（用于 prompt 注入）
   *
   * 策略：索引 + 该 agent 的职责区 + 任务跟踪 + 最近 log
   * 而非注入整篇文档（节省 context window）
   */
  async getRelevantContext(threadId: string, agentId: string): Promise<string> {
    const doc = await this.getDoc(threadId);
    if (!doc) return "";

    const sections = parseSections(doc);
    const agentConfig = AGENT_SECTIONS.find((a) => a.id === agentId);
    const agentName = agentConfig?.name ?? agentId;

    const relevantParts: string[] = [];

    // 1. 项目标题 + 代码结构（共享上下文）
    for (const sec of sections) {
      if (sec.level === 1) {
        relevantParts.push(sec.title + "\n" + sec.content);
      }
      if (sec.titleText?.includes("代码结构")) {
        relevantParts.push(sec.title + "\n" + sec.content);
      }
    }

    // 2. 该 agent 的职责区
    for (const sec of sections) {
      if (sec.level === 3 && (sec.titleText?.includes(agentName) || sec.titleText?.includes(agentId))) {
        relevantParts.push(sec.title + "\n" + sec.content);
      }
    }

    // 3. 完整的任务跟踪
    const taskSection = sections.find((s) => s.titleText?.includes("任务跟踪"));
    if (taskSection) {
      relevantParts.push(taskSection.title + "\n" + taskSection.content);
    }

    // 4. 完整的变更记录
    const changelogSection = sections.find((s) => s.titleText?.includes("变更记录"));
    if (changelogSection) {
      relevantParts.push(changelogSection.title + "\n" + changelogSection.content);
    }

    // 5. 最近 log 条目
    const recentLog = await this.getRecentLog(threadId, 5);
    if (recentLog) {
      relevantParts.push(recentLog);
    }

    const result = relevantParts.join("\n\n");
    return result;
  }
}

// ========== 章节解析与合并 ==========

/** 解析 markdown 为有序的 section 列表 */
function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [{ level: 0, title: "", titleText: "", content: "" }];
  let current = sections[0];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      current = {
        level: headingMatch[1].length,
        title: line,
        titleText: headingMatch[2].trim(),
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
    const changelogIdx = existingSections.findIndex((s) => s.titleText?.includes("变更记录"));
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
