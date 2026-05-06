/**
 * Router 单元测试
 *
 * 注意：router.ts 直接导入 pool.ts 的 agentConfigs，
 * 所以我们需要确保 pool.ts 被加载（它会注册 agent）。
 * 由于 pool.ts 的副作用（创建 ClaudeProcess 实例、注册 agent），
 * 我们使用 vi.mock 来隔离。
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// mock ClaudeProcess 避免实际启动 CLI 子进程
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

// mock file-memory 避免 fs 依赖
vi.mock("./store/file-memory.js", () => ({
  FileMemoryStore: vi.fn().mockImplementation(() => ({
    buildMemoryContext: vi.fn().mockResolvedValue(""),
    updateMemory: vi.fn().mockResolvedValue(undefined),
  })),
}));

// mock session-store 的文件操作
vi.mock("./store/session-store.js", () => ({
  loadSessions: vi.fn(),
  getSessionId: vi.fn().mockReturnValue(null),
  saveSessionId: vi.fn(),
  loadChain: vi.fn().mockReturnValue([]),
  saveChain: vi.fn(),
  getActiveSessionRecord: vi.fn().mockReturnValue(null),
}));

import { parseUserMentions, parseAgentMentions, route, buildA2APrompt, createA2AContext } from "./router.js";
import { MAX_A2A_CHAIN } from "./pool.js";

describe("parseUserMentions", () => {
  it("应该解析中文 @mention", () => {
    const result = parseUserMentions("@佐佐木 请帮我写个按钮");
    expect(result.mentions).toEqual(["sasaki"]);
    expect(result.message).toContain("请帮我写个按钮");
    expect(result.message).not.toContain("@佐佐木");
  });

  it("应该解析英文 @mention", () => {
    const result = parseUserMentions("@kohana 帮我测试");
    expect(result.mentions).toEqual(["kohana"]);
    expect(result.message).toContain("帮我测试");
  });

  it("应该解析别名", () => {
    const result = parseUserMentions("@前厅 这个页面有问题");
    expect(result.mentions).toEqual(["sasaki"]);
  });

  it("应该解析多个 @mention 并去重", () => {
    const result = parseUserMentions("@佐佐木 @sasaki @小花 一起看下");
    expect(result.mentions).toEqual(["sasaki", "kohana"]);
  });

  it("未知的 @mention 应被忽略（但 cleanMessage 会移除它）", () => {
    const result = parseUserMentions("@随便谁 来一下");
    expect(result.mentions).toEqual([]);
    // 实际行为：未知的 @mention 也会被 replace 掉（正则匹配所有 @xxx）
    expect(result.message).toBe("来一下");
  });

  it("没有 @mention 应返回空列表和原消息", () => {
    const result = parseUserMentions("帮我写个页面");
    expect(result.mentions).toEqual([]);
    expect(result.message).toBe("帮我写个页面");
  });
});

describe("parseAgentMentions", () => {
  it("应该解析 agent 回复中的 @mention", () => {
    const response = "我处理完了前端部分，@文藏 请对接后端 API";
    const mentions = parseAgentMentions(response, "sasaki");
    expect(mentions).toEqual(["bunzo"]);
  });

  it("应该排除自己（selfId）", () => {
    const response = "@佐佐木 这个需要前端处理一下";
    const mentions = parseAgentMentions(response, "sasaki");
    expect(mentions).toEqual([]);
  });

  it("应该忽略代码块中的 @mention", () => {
    const response = "修复完成\n```ts\n// @ts-ignore\nconst x = 1;\n```\n@文藏 请 review";
    const mentions = parseAgentMentions(response, "kohana");
    expect(mentions).toEqual(["bunzo"]);
  });

  it("应该忽略行内代码中的 @mention", () => {
    const response = "用 `@deprecated` 标记旧 API。@小花 请测试一下";
    const mentions = parseAgentMentions(response, "bunzo");
    expect(mentions).toEqual(["kohana"]);
  });

  it("应该去重保持顺序", () => {
    const response = "@文藏 @小花 @文藏 @佐佐木 请协作";
    const mentions = parseAgentMentions(response, "kohana");
    expect(mentions).toEqual(["bunzo", "sasaki"]);
  });
});

describe("route", () => {
  it("指定 agents 时应直接使用", () => {
    const result = route("hello", ["sasaki", "kohana"]);
    expect(result.targetAgents).toEqual(["sasaki", "kohana"]);
    expect(result.message).toBe("hello");
  });

  it("有 @mention 时应路由到指定 agent", () => {
    const result = route("@小花 帮我测试");
    expect(result.targetAgents).toEqual(["kohana"]);
    expect(result.message).not.toContain("@小花");
  });

  it("无 @mention 时应广播给所有 agent", () => {
    const result = route("帮我看看这个 bug");
    expect(result.targetAgents).toContain("sasaki");
    expect(result.targetAgents).toContain("bunzo");
    expect(result.targetAgents).toContain("kohana");
    expect(result.message).toBe("帮我看看这个 bug");
  });

  it("specifiedAgents 为空数组时应走默认广播", () => {
    const result = route("hello", []);
    expect(result.targetAgents.length).toBeGreaterThan(0);
  });
});

describe("buildA2APrompt", () => {
  it("应该生成包含任务指令的 A2A prompt", () => {
    const prompt = buildA2APrompt("sasaki", "bunzo", "@文藏 请实现 /api/health 端点\n\n同时 @小花 测试一下");
    expect(prompt).toContain("佐佐木 给你分配了一个任务");
    expect(prompt).toContain("/api/health");
  });

  it("应该包含任务指令", () => {
    const prompt = buildA2APrompt("kohana", "bunzo", "@文藏 修一下这个 bug");
    expect(prompt).toContain("小花 给你分配了一个任务");
    expect(prompt).toContain("修一下这个 bug");
  });
});

describe("createA2AContext", () => {
  it("默认 depth 应为 1", () => {
    const ctx = createA2AContext("sasaki");
    expect(ctx.depth).toBe(1);
    expect(ctx.callerId).toBe("sasaki");
    expect(ctx.maxDepth).toBe(MAX_A2A_CHAIN);
  });

  it("自定义 depth", () => {
    const ctx = createA2AContext(null, 3);
    expect(ctx.depth).toBe(3);
    expect(ctx.callerId).toBeNull();
  });
});
