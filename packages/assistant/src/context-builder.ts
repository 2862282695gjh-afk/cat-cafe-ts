/**
 * Prompt 上下文构建器
 *
 * 在发送消息前，将记忆、角色、历史等注入到 prompt 中。
 */
import type { MemoryStore } from "./memory.js";
import type { AgentIdentity } from "./identity.js";
import type { SkillRegistry } from "./skill-registry.js";

export interface ContextBuildOptions {
  agent: AgentIdentity;
  threadId?: string;
  memoryStore?: MemoryStore;
  skillRegistry?: SkillRegistry;
  threadRoles?: Record<string, string>;
  threadMessages?: Array<{ role: string; agentId: string; content: string }>;
  longMemory?: Record<string, string>;
  threadMemory?: Record<string, string>;
}

export function buildPrompt(userMessage: string, options: ContextBuildOptions): string {
  const sections: string[] = [];

  // 对话历史
  if (options.threadMessages?.length) {
    sections.push("--- 对话历史 ---");
    for (const msg of options.threadMessages.slice(-10)) {
      const prefix = msg.role === "user" ? "用户" : `[${msg.agentId}]`;
      sections.push(`${prefix}: ${msg.content}`);
    }
    sections.push("");
  }

  // 长期记忆
  const lm = options.longMemory;
  if (lm && Object.keys(lm).length > 0) {
    sections.push("--- 记住的信息 ---");
    for (const [key, value] of Object.entries(lm)) {
      sections.push(`${key}: ${value}`);
    }
    sections.push("");
  }

  // 房间记忆
  const tm = options.threadMemory;
  if (tm && Object.keys(tm).length > 0) {
    sections.push("--- 房间记忆 ---");
    for (const [key, value] of Object.entries(tm)) {
      sections.push(`${key}: ${value}`);
    }
    sections.push("");
  }

  // 角色配置
  if (options.threadRoles && Object.keys(options.threadRoles).length > 0) {
    sections.push("--- 你的角色 ---");
    const myRole = options.threadRoles[options.agent.id];
    if (myRole) sections.push(`在这个对话中，你的角色是: ${myRole}`);
    sections.push("");
  }

  // Skill 触发词匹配提示
  if (options.skillRegistry) {
    const match = options.skillRegistry.matchByTrigger(userMessage);
    if (match) {
      sections.push(`--- 技能匹配 ---`);
      sections.push(`触发词 "${match.matchedTrigger}" 匹配到技能: ${match.skill.name}`);
      sections.push(`请按照 "${match.skill.name}" 的规范执行。`);
      sections.push("");
    }
  }

  sections.push(`用户消息: ${userMessage}`);

  return sections.join("\n");
}
