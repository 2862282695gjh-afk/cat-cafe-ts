/**
 * WorklistRouter — @mention 路由 + A2A 通信
 *
 * 用户可以用 @佐佐木 指定 agent，不指定则广播给所有猫。
 * Agent 回复中如果包含 @mention，自动触发 A2A 调用链。
 */
import { pool, agentConfigs, agentStatus, MAX_A2A_DEPTH } from "./pool.js";

const MAX_A2A_PER_RESPONSE = 2;

/** 中文/ID 名称 → agent ID 的映射 */
const NAME_MAP: Record<string, string> = {
  // 中文
  "佐佐木": "sasaki",
  "文藏": "bunzo",
  "小花": "kohana",
  // 英文
  "sasaki": "sasaki",
  "bunzo": "bunzo",
  "kohana": "kohana",
  // 别名
  "前厅": "sasaki",
  "主厨": "bunzo",
  "品控": "kohana",
};

function resolveAgentId(name: string): string | null {
  const lower = name.toLowerCase();
  if (NAME_MAP[lower]) return NAME_MAP[lower];
  if (NAME_MAP[name]) return NAME_MAP[name];
  // 直接匹配 agent ID
  if (agentConfigs[lower]) return lower;
  return null;
}

/** 解析用户输入中的 @mentions */
export function parseUserMentions(input: string): { mentions: string[]; message: string } {
  const mentionRegex = /@([\w\u4e00-\u9fff\-]+)/g;
  const mentions: string[] = [];
  let cleanMessage = input;

  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(input)) !== null) {
    const name = match[1];
    const agentId = resolveAgentId(name);
    if (agentId) {
      mentions.push(agentId);
    }
    cleanMessage = cleanMessage.replace(match[0], "");
  }

  return { mentions: [...new Set(mentions)], message: cleanMessage.trim() };
}

/** 解析 agent 回复中的 @mentions（用于 A2A） */
export function parseAgentMentions(response: string, selfId: string): string[] {
  // 先移除代码块（避免误解析代码中的 @）
  const cleaned = response
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "");

  const mentionRegex = /@([\w\u4e00-\u9fff\-]+)/g;
  const mentions: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(cleaned)) !== null) {
    const name = match[1];
    const agentId = resolveAgentId(name);
    if (agentId && agentId !== selfId && agentConfigs[agentId]) {
      mentions.push(agentId);
    }
  }

  // 去重保持顺序
  return [...new Set(mentions)];
}

/** 从 agent 回复中提取给特定 target 的任务描述 */
function extractTaskForTarget(response: string, targetId: string): string {
  const targetConfig = agentConfigs[targetId];
  const names = [targetId];
  if (targetConfig) {
    names.push(targetConfig.name);
    if (targetConfig.name === "文藏") names.push("bunzo");
    if (targetConfig.name === "佐佐木") names.push("sasaki");
    if (targetConfig.name === "小花") names.push("kohana");
  }

  // 找到 @mention 的位置
  for (const name of names) {
    const patterns = [`@${name}`, `@${name}（`, `@${name}(`];
    for (const pat of patterns) {
      const idx = response.indexOf(pat);
      if (idx >= 0) {
        const after = response.slice(idx);
        // 跳过前面连续的 @mention（如 "@文藏 @佐佐木 @小花"），找到真正指令
        const instructionStart = after.match(/^(?:@[\w\u4e00-\u9fff\-]+\s*)+/u);
        if (instructionStart) {
          const instruction = after.slice(instructionStart[0].length).trim();
          if (instruction) {
            // 取到句号/换行
            const endMatch = instruction.match(/^(.+?)(?:[。！？\n]|$)/u);
            return endMatch ? endMatch[1].trim() : instruction;
          }
        }
        // fallback: 取整行
        const firstLine = after.split("\n")[0].trim();
        if (firstLine) return firstLine;
      }
    }
  }

  return response;
}

/** 构建 A2A 调用的上下文 */
export function buildA2APrompt(
  callerId: string,
  targetId: string,
  originalMessage: string,
): string {
  const callerConfig = agentConfigs[callerId];
  const callerName = callerConfig?.name ?? callerId;

  // 只提取跟这个 target 相关的任务指令，不传整个回复
  const taskInstruction = extractTaskForTarget(originalMessage, targetId);

  return `${callerName} 给你分配了一个任务，请直接执行：

${taskInstruction}`;
}

/** 获取 agent 的路由信息 */
export function getAgentRouteInfo(): string {
  return Object.values(agentConfigs)
    .map((a) => `- ${a.name}（@${a.id}）: ${a.description}`)
    .join("\n");
}

export interface RouteResult {
  /** 主调用目标 */
  targetAgents: string[];
  /** 清理后的消息（去掉 @mentions） */
  message: string;
}

/** 决定消息发给谁 */
export function route(message: string, specifiedAgents?: string[]): RouteResult {
  if (specifiedAgents && specifiedAgents.length > 0) {
    return { targetAgents: specifiedAgents, message };
  }

  const { mentions, message: cleanMsg } = parseUserMentions(message);
  if (mentions.length > 0) {
    return { targetAgents: mentions, message: cleanMsg };
  }

  // 默认广播给所有猫，各自判断是否需要响应
  return { targetAgents: Object.keys(agentConfigs), message };
}

/** A2A 调用追踪 */
export interface A2AContext {
  depth: number;
  callerId: string | null;
  maxDepth: number;
}

export function createA2AContext(callerId: string | null, depth = 1): A2AContext {
  return { depth, callerId, maxDepth: MAX_A2A_DEPTH };
}
