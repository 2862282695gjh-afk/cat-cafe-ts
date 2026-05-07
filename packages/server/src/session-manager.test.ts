/**
 * SessionManager 单元测试
 *
 * 测试上下文窗口管理、事前拦截、封印/重生等核心逻辑。
 * 外部依赖（文件系统、ClaudeProcess）全部 mock。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResultEvent } from "@cat-noodle/core";

// Mock 所有外部依赖
vi.mock("@cat-noodle/provider-claude", () => {
  return {
    ClaudeProcess: class MockClaudeProcess {
      sessionId?: string;
      constructor() {
        this.sessionId = undefined;
      }
      async *send() {}
      stop() {}
      switchSession() {}
      resetSession() {}
    },
  };
});

vi.mock("./store/file-memory.js", () => ({
  FileMemoryStore: vi.fn().mockImplementation(() => ({
    buildMemoryContext: vi.fn().mockResolvedValue("用户是开发者"),
    updateMemory: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("./store/session-store.js", () => ({
  loadSessions: vi.fn(),
  getSessionId: vi.fn().mockReturnValue(null),
  saveSessionId: vi.fn(),
  loadChain: vi.fn().mockReturnValue([]),
  saveChain: vi.fn(),
  getActiveSessionRecord: vi.fn().mockReturnValue(null),
}));

vi.mock("./pool.js", () => ({
  agentConfigs: {
    sasaki: { id: "sasaki", name: "佐佐木" },
    bunzo: { id: "bunzo", name: "文藏" },
    kohana: { id: "kohana", name: "小花" },
  },
  MAX_A2A_DEPTH: 5,
  MAX_A2A_CHAIN: 30,
  pool: { register: () => {}, get: () => undefined, agentIds: [] },
  agentStatus: new Map(),
  cleanup: () => {},
}));

import { SessionManager } from "./session-manager.js";

function makeResultEvent(overrides: Partial<ResultEvent> = {}): ResultEvent {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1000,
    duration_api_ms: 800,
    session_id: "test-session-id",
    result: "",
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 10000,
      output_tokens: 2000,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 1000,
    },
    num_turns: 2,
    stop_reason: "end_turn",
    uuid: "test-uuid",
    ...overrides,
  } as ResultEvent;
}

describe("SessionManager", () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager(
      { buildMemoryContext: vi.fn().mockResolvedValue(""), updateMemory: vi.fn().mockResolvedValue(undefined) } as any,
      0.85,
    );
  });

  describe("updateState", () => {
    it("应该从 result 事件提取 token 使用量", () => {
      const result = makeResultEvent();
      sm.updateState("sasaki", result);

      // raw = 10000 + 5000 + 1000 = 16000, numTurns = 2, estimated = 8000
      const state = (sm as unknown as { states: Map<string, { totalInputTokens: number; contextWindow: number }> }).states.get("sasaki");
      expect(state).toBeDefined();
      expect(state!.totalInputTokens).toBe(8000);
    });

    it("应该使用 modelUsage 中的 contextWindow", () => {
      const result = makeResultEvent({
        modelUsage: {
          "claude-3-opus": {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: 0,
            contextWindow: 100000,
            maxOutputTokens: 8192,
          },
        },
      });
      sm.updateState("kohana", result);

      const state = (sm as unknown as { states: Map<string, { totalInputTokens: number; contextWindow: number }> }).states.get("kohana");
      expect(state!.contextWindow).toBe(100000);
    });

    it("无 modelUsage 时应使用默认 200000", () => {
      const result = makeResultEvent();
      sm.updateState("bunzo", result);

      const state = (sm as unknown as { states: Map<string, { totalInputTokens: number; contextWindow: number }> }).states.get("bunzo");
      expect(state!.contextWindow).toBe(200000);
    });

    it("numTurns 为 0 时应避免除零（使用 max(numTurns, 1)）", () => {
      const result = makeResultEvent({ num_turns: 0 });
      sm.updateState("sasaki", result);

      // numTurns = max(0, 1) = 1, so estimated = 16000
      const state = (sm as unknown as { states: Map<string, { totalInputTokens: number; contextWindow: number }> }).states.get("sasaki");
      expect(state!.totalInputTokens).toBe(16000);
    });
  });

  describe("shouldSealBeforeSend", () => {
    it("投影占用率 >= 阈值时应返回 true", () => {
      // 设置状态：80000 / 200000 = 40%
      sm.updateState("sasaki", makeResultEvent({
        usage: { input_tokens: 80000, output_tokens: 1000, cache_read_input_tokens: 80000, cache_creation_input_tokens: 0 },
        num_turns: 1,
      }));

      // 新消息预估 100000 token → 80000 + 100000 = 180000 / 200000 = 90% >= 85%
      expect(sm.shouldSealBeforeSend("sasaki", 100000)).toBe(true);
    });

    it("投影占用率 < 阈值时应返回 false", () => {
      sm.updateState("sasaki", makeResultEvent());

      // 8000 + 1000 = 9000 / 200000 = 4.5% < 85%
      expect(sm.shouldSealBeforeSend("sasaki", 1000)).toBe(false);
    });

    it("无状态时应返回 false", () => {
      expect(sm.shouldSealBeforeSend("nonexistent", 100000)).toBe(false);
    });

    it("边界情况：刚好达到阈值", () => {
      // 170000 / 200000 = 85%
      sm.updateState("sasaki", makeResultEvent({
        usage: { input_tokens: 170000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        num_turns: 1,
      }));

      // 170000 + 0 = 170000 / 200000 = 85% → 刚好等于阈值
      expect(sm.shouldSealBeforeSend("sasaki", 0)).toBe(true);
    });
  });

  describe("getSessionId", () => {
    it("更新后应返回 session ID", () => {
      sm.updateState("kohana", makeResultEvent({ session_id: "my-session-123" }));
      expect(sm.getSessionId("kohana")).toBe("my-session-123");
    });

    it("未更新的 agent 应返回 null", () => {
      expect(sm.getSessionId("bunzo")).toBeNull();
    });
  });
});
