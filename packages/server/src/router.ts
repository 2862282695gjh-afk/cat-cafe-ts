/**
 * WorklistRouter — @mention 路由 + A2A 通信
 *
 * 用户可以用 @佐佐木 指定 agent，不指定则广播给所有猫。
 * Agent 回复中如果包含 @mention，自动触发 A2A 调用链。
 */
import { pool, agentConfigs, agentStatus, MAX_A2A_DEPTH, MAX_A2A_CHAIN } from "./pool.js";

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

/** 解析 agent 回复中的 mentions（用于 A2A），支持 @名字 和 无@ 名字 */
export function parseAgentMentions(response: string, selfId: string): string[] {
  // 先移除代码块（避免误解析代码中的名字）
  const cleaned = response
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "");

  const mentions: string[] = [];

  // 1. 显式 @mention（优先）
  const explicitRegex = /@([\w\u4e00-\u9fff\-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = explicitRegex.exec(cleaned)) !== null) {
    const agentId = resolveAgentId(match[1]);
    if (agentId && agentId !== selfId && agentConfigs[agentId]) {
      mentions.push(agentId);
    }
  }

  // 2. 兜底：检测不带 @ 的名字（LLM 经常漏掉 @）
  //    只匹配"名字 + 任务动词/标点"模式，减少误触发
  for (const [id, config] of Object.entries(agentConfigs)) {
    if (id === selfId) continue;
    const names = [id, config.name];
    for (const name of names) {
      // 匹配：名字紧跟逗号/冒号/任务指示（如"佐佐木，请..."、"文藏：..."）
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const taskPattern = new RegExp(`(?<!@)${escaped}[，：:,\n]\\s*[^\\s，。！？\n]`, "u");
      if (taskPattern.test(cleaned) && !mentions.includes(id)) {
        mentions.push(id);
        break;
      }
    }
  }

  // 去重保持顺序
  return [...new Set(mentions)];
}

/** 构建 A2A 调用的上下文 */
export function buildA2APrompt(
  callerId: string,
  targetId: string,
  originalMessage: string,
): string {
  const callerConfig = agentConfigs[callerId];
  const callerName = callerConfig?.name ?? callerId;

  return `${callerName} 给你分配了一个任务，请直接执行：

${originalMessage}`;
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
  return { depth, callerId, maxDepth: MAX_A2A_CHAIN };
}
