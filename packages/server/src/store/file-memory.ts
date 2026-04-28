/**
 * 文件持久化的 Agent 长期记忆存储
 *
 * 每个 agent 一个 JSON 文件：data/memories/{agentId}.json
 * 包含用户画像、重要事实、对话摘要等跨 session 持久化信息。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface UserProfile {
  name?: string;
  role?: string;
  preferences?: string[];
  expertise?: string[];
  communicationStyle?: string;
}

export interface AgentLongMemory {
  agentId: string;
  updatedAt: number;
  userProfile: UserProfile;
  conversationSummary: string;
  keyFacts: string[];
  personalityState?: Record<string, string>;
}

const EMPTY_MEMORY = (agentId: string): AgentLongMemory => ({
  agentId,
  updatedAt: Date.now(),
  userProfile: {},
  conversationSummary: "",
  keyFacts: [],
});

export class FileMemoryStore {
  private memoryDir: string;
  private cache = new Map<string, AgentLongMemory>();

  constructor(memoryDir?: string) {
    this.memoryDir = memoryDir ?? join(process.cwd(), "data", "memories");
  }

  /** 确保存储目录存在 */
  async init(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
  }

  private filePath(agentId: string): string {
    return join(this.memoryDir, `${agentId}.json`);
  }

  /** 读取 agent 的长期记忆 */
  async getMemory(agentId: string): Promise<AgentLongMemory> {
    const cached = this.cache.get(agentId);
    if (cached) return cached;

    try {
      const raw = await readFile(this.filePath(agentId), "utf-8");
      const mem: AgentLongMemory = JSON.parse(raw);
      this.cache.set(agentId, mem);
      return mem;
    } catch {
      return EMPTY_MEMORY(agentId);
    }
  }

  /** 保存 agent 的长期记忆 */
  private async save(agentId: string, mem: AgentLongMemory): Promise<void> {
    mem.updatedAt = Date.now();
    this.cache.set(agentId, mem);
    await writeFile(this.filePath(agentId), JSON.stringify(mem, null, 2), "utf-8");
  }

  /** 增量更新记忆（深度合并） */
  async updateMemory(agentId: string, patch: Partial<AgentLongMemory>): Promise<void> {
    const mem = await this.getMemory(agentId);

    if (patch.userProfile) {
      mem.userProfile = { ...mem.userProfile, ...patch.userProfile };
    }

    if (patch.conversationSummary !== undefined) {
      mem.conversationSummary = patch.conversationSummary;
    }

    if (patch.keyFacts) {
      // 合并新事实，去重
      const existing = new Set(mem.keyFacts);
      for (const fact of patch.keyFacts) {
        if (!existing.has(fact)) {
          mem.keyFacts.push(fact);
        }
      }
    }

    // 删除过时事实
    if ((patch as Record<string, unknown>).keyFactsToRemove) {
      const removeSet = new Set((patch as Record<string, unknown>).keyFactsToRemove as string[]);
      mem.keyFacts = mem.keyFacts.filter((f) => !removeSet.has(f));
    }

    if (patch.personalityState) {
      mem.personalityState = { ...mem.personalityState, ...patch.personalityState };
    }

    await this.save(agentId, mem);
  }

  /** 构建注入 system prompt 的记忆上下文 */
  async buildMemoryContext(agentId: string): Promise<string> {
    const mem = await this.getMemory(agentId);
    const parts: string[] = ["## 长期记忆"];

    // 用户画像
    const profile = mem.userProfile;
    const profileLines: string[] = [];
    if (profile.name) profileLines.push(`- 姓名: ${profile.name}`);
    if (profile.role) profileLines.push(`- 角色: ${profile.role}`);
    if (profile.communicationStyle) profileLines.push(`- 沟通风格: ${profile.communicationStyle}`);
    if (profile.expertise?.length) profileLines.push(`- 技术专长: ${profile.expertise.join(", ")}`);
    if (profile.preferences?.length) profileLines.push(`- 偏好: ${profile.preferences.join(", ")}`);

    if (profileLines.length > 0) {
      parts.push("### 用户画像");
      parts.push(profileLines.join("\n"));
    }

    // 重要事实
    if (mem.keyFacts.length > 0) {
      parts.push("### 重要事实");
      parts.push(mem.keyFacts.map((f) => `- ${f}`).join("\n"));
    }

    // 对话摘要
    if (mem.conversationSummary) {
      parts.push("### 对话历史摘要");
      parts.push(mem.conversationSummary);
    }

    return parts.length > 1 ? parts.join("\n\n") : "";
  }
}
