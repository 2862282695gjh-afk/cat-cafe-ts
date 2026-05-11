/**
 * 任务看板存储
 *
 * 猫咪通过 API 创建/完成任务，前端看板实时显示。
 * 文件位置: data/tasks/{threadId}.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface BoardTask {
  id: string;
  threadId: string;
  title: string;
  description?: string;
  createdBy: string;    // agentId
  createdByName: string;
  assignee?: string;    // agentId（谁来做）
  assigneeName?: string;
  status: "pending" | "in_progress" | "done";
  createdAt: number;
  completedAt?: number;
}

export class TaskBoardStore {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? join(process.cwd(), "data", "tasks");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private filePath(threadId: string): string {
    return join(this.dir, `${threadId}.json`);
  }

  private async readBoard(threadId: string): Promise<BoardTask[]> {
    try {
      const raw = await readFile(this.filePath(threadId), "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private async writeBoard(threadId: string, tasks: BoardTask[]): Promise<void> {
    await writeFile(this.filePath(threadId), JSON.stringify(tasks, null, 2), "utf-8");
  }

  /** 创建任务 */
  async createTask(data: {
    threadId: string;
    title: string;
    description?: string;
    createdBy: string;
    createdByName: string;
    assignee?: string;
    assigneeName?: string;
  }): Promise<BoardTask> {
    const tasks = await this.readBoard(data.threadId);
    const task: BoardTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      threadId: data.threadId,
      title: data.title,
      description: data.description,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      assignee: data.assignee,
      assigneeName: data.assigneeName,
      status: "pending",
      createdAt: Date.now(),
    };
    tasks.push(task);
    await this.writeBoard(data.threadId, tasks);
    return task;
  }

  /** 开始任务 */
  async startTask(threadId: string, taskId: string): Promise<BoardTask | null> {
    const tasks = await this.readBoard(threadId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.status = "in_progress";
    await this.writeBoard(threadId, tasks);
    return task;
  }

  /** 完成任务 */
  async completeTask(threadId: string, taskId: string): Promise<BoardTask | null> {
    const tasks = await this.readBoard(threadId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.status = "done";
    task.completedAt = Date.now();
    await this.writeBoard(threadId, tasks);
    return task;
  }

  /** 获取看板（按 thread） */
  async getBoard(threadId: string): Promise<BoardTask[]> {
    return this.readBoard(threadId);
  }

  /** 删除看板 */
  async deleteBoard(threadId: string): Promise<void> {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(this.filePath(threadId));
    } catch { /* ignore */ }
  }
}
