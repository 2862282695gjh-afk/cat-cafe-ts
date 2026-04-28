/**
 * @cat-cafe/core — 共享类型定义
 */

// ========== Content Blocks ==========

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock;

// ========== Stream Events ==========

export interface SystemEvent {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: string[];
  model: string;
  cwd: string;
  uuid: string;
  [key: string]: unknown;
}

export interface AssistantEvent {
  type: "assistant";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: ContentBlock[];
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
  parent_tool_use_id: string | null;
  session_id: string;
  uuid: string;
}

export interface ToolResultEvent {
  type: "tool_result";
  tool_name?: string;
  tool_use_id?: string;
  content: string;
  [key: string]: unknown;
}

export interface ResultEvent {
  type: "result";
  subtype: "success" | "error";
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  stop_reason: string;
  session_id: string;
  total_cost_usd: number;
  usage: UsageInfo;
  modelUsage?: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      costUSD: number;
      contextWindow: number;
      maxOutputTokens: number;
    }
  >;
  uuid: string;
}

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  [key: string]: unknown;
}

/** Status 事件（内部使用，不会从 CLI 输出） */
export interface StatusEvent {
  type: "status";
  status: "thinking" | "streaming" | "idle" | "retry";
  message: string;
}

/** Error 事件 */
export interface ErrorEvent {
  type: "error";
  message: string;
}

/** 上下文压缩事件 */
export interface CompactedEvent {
  type: "compacted";
  agentId: string;
  tokensSaved: number;
  message: string;
}

/** 联合类型 */
export type StreamEvent =
  | SystemEvent
  | AssistantEvent
  | ToolResultEvent
  | ResultEvent
  | StatusEvent
  | ErrorEvent
  | CompactedEvent
  | { type: string; [key: string]: unknown };

// ========== Agent 相关 ==========

export interface AgentConfig {
  id: string;
  name: string;
  avatar?: string;
  systemPrompt?: string;
  model?: string;
  provider?: string;
}

/** 带 agentId 标签的事件（广播合并后使用） */
export interface TaggedStreamEvent {
  agentId: string;
  event: StreamEvent;
}

// ========== AgentProvider 接口 ==========

export interface SendOptions {
  sessionId?: string;
  signal?: AbortSignal;
}

/** Provider 接口 — 每个 CLI 实现需要实现此接口 */
export interface AgentProvider {
  sessionId: string | null;
  send(prompt: string, options?: SendOptions): AsyncGenerator<StreamEvent, void, undefined>;
  stop?(): void;
}
