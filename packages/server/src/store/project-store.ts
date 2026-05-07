/**
 * 项目数据存储
 *
 * 每个项目对应一个工作目录（cwd），thread 绑定到 project 后
 * Agent 会在该目录下执行所有文件操作。
 *
 * 文件位置: data/projects.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "./interface.js";

export class ProjectStore {
  private dir: string;
  private cache: Project[] | null = null;

  constructor(dir?: string) {
    this.dir = dir ?? join(process.cwd(), "data");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private filePath(): string {
    return join(this.dir, "projects.json");
  }

  private async read(): Promise<Project[]> {
    if (this.cache !== null) return this.cache;
    try {
      const raw = await readFile(this.filePath(), "utf-8");
      this.cache = JSON.parse(raw);
      return this.cache!;
    } catch {
      this.cache = [];
      return [];
    }
  }

  private async write(projects: Project[]): Promise<void> {
    this.cache = projects;
    await writeFile(this.filePath(), JSON.stringify(projects, null, 2), "utf-8");
  }

  async listProjects(): Promise<Project[]> {
    return this.read();
  }

  async getProject(id: string): Promise<Project | null> {
    const projects = await this.read();
    return projects.find((p) => p.id === id) ?? null;
  }

  async createProject(data: { name: string; path: string; description?: string }): Promise<Project> {
    const projects = await this.read();
    const project: Project = {
      id: crypto.randomUUID(),
      name: data.name,
      path: data.path,
      description: data.description,
      createdAt: Date.now(),
    };
    projects.push(project);
    await this.write(projects);
    return project;
  }

  async updateProject(id: string, patch: Partial<Pick<Project, "name" | "path" | "description">>): Promise<Project | null> {
    const projects = await this.read();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    projects[idx] = { ...projects[idx], ...patch };
    await this.write(projects);
    return projects[idx];
  }

  async deleteProject(id: string): Promise<boolean> {
    const projects = await this.read();
    const filtered = projects.filter((p) => p.id !== id);
    if (filtered.length === projects.length) return false;
    await this.write(filtered);
    return true;
  }
}
