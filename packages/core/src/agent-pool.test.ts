/**
 * AgentPool 单元测试
 */
import { describe, it, expect } from "vitest";
import { AgentPool } from "./agent-pool.js";
import type { AgentProvider, StreamEvent, SendOptions } from "./types.js";

/** 创建一个 mock AgentProvider，返回预设的事件流 */
function createMockAgent(events: StreamEvent[]): AgentProvider {
  return {
    sessionId: null,
    async *send(_prompt: string, _options?: SendOptions) {
      for (const event of events) {
        yield event;
      }
    },
    stop() {},
  };
}

describe("AgentPool", () => {
  it("register 和 get 应正常工作", () => {
    const pool = new AgentPool();
    const agent = createMockAgent([]);
    pool.register("test", agent);
    expect(pool.get("test")).toBe(agent);
    expect(pool.get("nonexistent")).toBeUndefined();
    expect(pool.agentIds).toEqual(["test"]);
  });

  it("unregister 应移除 agent", () => {
    const pool = new AgentPool();
    const agent = createMockAgent([]);
    pool.register("test", agent);
    pool.unregister("test");
    expect(pool.get("test")).toBeUndefined();
    expect(pool.agentIds).toEqual([]);
  });

  it("broadcast 应向指定 agent 发送消息", async () => {
    const pool = new AgentPool();
    const agent = createMockAgent([
      { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } } as StreamEvent,
      { type: "result", session_id: "sess-1", result: "hello", usage: { input_tokens: 10, output_tokens: 5 } } as StreamEvent,
    ]);
    pool.register("cat1", agent);

    const events: Array<{ agentId: string; event: StreamEvent }> = [];
    for await (const tagged of pool.broadcast("test prompt", ["cat1"])) {
      events.push(tagged);
    }

    expect(events.length).toBe(2);
    expect(events[0].agentId).toBe("cat1");
    expect(events[0].event.type).toBe("assistant");
    expect(events[1].agentId).toBe("cat1");
    expect(events[1].event.type).toBe("result");
    // session_id 应更新到 agent
    expect(agent.sessionId).toBe("sess-1");
  });

  it("broadcast 默认应发给所有已注册 agent", async () => {
    const pool = new AgentPool();
    pool.register("a", createMockAgent([
      { type: "result", session_id: "s1", result: "a", usage: { input_tokens: 10, output_tokens: 5 } } as StreamEvent,
    ]));
    pool.register("b", createMockAgent([
      { type: "result", session_id: "s2", result: "b", usage: { input_tokens: 10, output_tokens: 5 } } as StreamEvent,
    ]));

    const agentIds = new Set<string>();
    for await (const tagged of pool.broadcast("test")) {
      agentIds.add(tagged.agentId);
    }

    expect(agentIds).toEqual(new Set(["a", "b"]));
  });

  it("broadcast 对未注册的 agent 应跳过", async () => {
    const pool = new AgentPool();
    pool.register("exists", createMockAgent([
      { type: "result", session_id: "s1", result: "ok", usage: { input_tokens: 10, output_tokens: 5 } } as StreamEvent,
    ]));

    let eventCount = 0;
    for await (const tagged of pool.broadcast("test", ["exists", "ghost"])) {
      eventCount++;
    }
    expect(eventCount).toBe(1);
  });

  it("broadcast 空列表应直接结束", async () => {
    const pool = new AgentPool();
    let eventCount = 0;
    for await (const _ of pool.broadcast("test", [])) {
      eventCount++;
    }
    expect(eventCount).toBe(0);
  });

  it("agent 出错时应 emit error 事件而不是抛出异常", async () => {
    const pool = new AgentPool();
    const badAgent: AgentProvider = {
      sessionId: null,
      async *send() {
        throw new Error("agent exploded");
      },
      stop() {},
    };
    pool.register("bad", badAgent);

    const events: StreamEvent[] = [];
    for await (const tagged of pool.broadcast("test", ["bad"])) {
      events.push(tagged.event);
    }

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].message).toContain("agent exploded");
    }
  });

  it("broadcastCollect 应收集所有 agent 的文本响应", async () => {
    const pool = new AgentPool();
    pool.register("a", createMockAgent([
      { type: "assistant", message: { content: [{ type: "text", text: "hello " }] } } as StreamEvent,
      { type: "assistant", message: { content: [{ type: "text", text: "world" }] } } as StreamEvent,
      { type: "result", session_id: "s1", result: "", usage: { input_tokens: 10, output_tokens: 5 } } as StreamEvent,
    ]));
    pool.register("b", createMockAgent([
      { type: "result", session_id: "s2", result: "fallback", usage: { input_tokens: 10, output_tokens: 5 } } as StreamEvent,
    ]));

    const results = await pool.broadcastCollect("test", ["a", "b"]);
    expect(results.get("a")).toBe("hello world");
    expect(results.get("b")).toBe("fallback");
  });

  it("signal 中止应停止 broadcast", async () => {
    const pool = new AgentPool();
    const controller = new AbortController();

    // 模拟一个慢 agent
    pool.register("slow", {
      sessionId: null,
      async *send() {
        yield { type: "assistant", message: { content: [{ type: "text", text: "chunk1" }] } } as StreamEvent;
        // 等待很久
        await new Promise((resolve) => setTimeout(resolve, 5000));
        yield { type: "assistant", message: { content: [{ type: "text", text: "chunk2" }] } } as StreamEvent;
      },
      stop() {},
    });

    const events: string[] = [];
    setTimeout(() => controller.abort(), 50);

    for await (const tagged of pool.broadcast("test", ["slow"], controller.signal)) {
      if (tagged.event.type === "assistant") {
        const content = (tagged.event as { message: { content: Array<{ type: string; text?: string }> } }).message.content;
        for (const block of content) {
          if (block.text) events.push(block.text);
        }
      }
    }

    // chunk1 应该被收到，chunk2 不应该
    expect(events).toContain("chunk1");
    expect(events).not.toContain("chunk2");
  });
});
