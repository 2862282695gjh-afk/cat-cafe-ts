/**
 * Socket.IO 事件处理
 *
 * 路由模式：
 *   - 默认广播给所有猫，用户可以 @佐佐木 / @文藏 / @小花 指定 agent
 *   - 猫之间可以通过 @mention 对等协作（A2A）
 *   - A2A 调用有深度限制，防止无限循环
 *   - 顶层多 agent 并行，同一 agent 内任务串行排队
 */
import type { Server as HTTPServer } from "node:http";
import { Server } from "socket.io";
import { pool, agentStatus, agentConfigs } from "../pool.js";
import { MemoryStore } from "../store/memory.js";
import type { AssistantEvent, ResultEvent } from "@cat-noodle/core";
import type { SessionManager } from "../session-manager.js";
import type { MemoryExtractor } from "../memory-extractor.js";
import { saveSessionId, getSessionId } from "../store/session-store.js";
import { route, parseAgentMentions, buildA2APrompt } from "../router.js";
import { ProjectDocStore } from "../store/project-doc-store.js";
import type { FileMemoryStore } from "../store/file-memory.js";

interface InvokePayload {
  threadId: string;
  message: string;
  agents?: string[];
}

interface AbortPayload {
  threadId: string;
}

/** 计算 agent pair depth：同一对 agent 之间连续来回的次数 */
function computePairDepth(chain: string[], callerId: string, targetId: string): number {
  const pairKey = [callerId, targetId].sort().join("↔");
  let depth = 1;
  // 从链尾往前看，数连续的同 pair 跳转
  for (let i = chain.length - 1; i >= 1; i--) {
    const hopPair = [chain[i - 1], chain[i]].sort().join("↔");
    if (hopPair === pairKey) {
      depth++;
    } else {
      break;
    }
  }
  return depth;
}

// ========== Agent 任务队列 ==========

interface AgentTask {
  id: string;
  fromAgentId: string | null;
  fromAgentName: string;
  message: string;
  status: "pending" | "running";
  enqueuedAt: number;
  threadId: string;
  callerId: string | null;
  depth: number;            // 同一对 agent 之间的来回次数
  callChain: string[];      // A2A 调用链（agentId 列表），用于计算 pair depth
}

class AgentTaskQueue {
  private queues = new Map<string, AgentTask[]>();
  private running = new Map<string, AgentTask | null>();

  enqueue(agentId: string, task: AgentTask): void {
    if (!this.queues.has(agentId)) this.queues.set(agentId, []);
    this.queues.get(agentId)!.push({ ...task, status: "pending" });
  }

  dequeue(agentId: string): AgentTask | null {
    const q = this.queues.get(agentId);
    if (!q || q.length === 0) return null;
    const task = q.shift()!;
    task.status = "running";
    this.running.set(agentId, task);
    return task;
  }

  markDone(agentId: string): void {
    this.running.set(agentId, null);
  }

  getCurrent(agentId: string): AgentTask | null {
    return this.running.get(agentId) ?? null;
  }

  getPendingCount(agentId: string): number {
    return this.queues.get(agentId)?.length ?? 0;
  }

  getAllPending(agentId: string): AgentTask[] {
    return this.queues.get(agentId) ?? [];
  }

  getSnapshot(): Record<string, { current: AgentTask | null; pending: AgentTask[] }> {
    const result: Record<string, { current: AgentTask | null; pending: AgentTask[] }> = {};
    for (const agentId of Object.keys(agentConfigs)) {
      result[agentId] = {
        current: this.getCurrent(agentId),
        pending: this.getAllPending(agentId),
      };
    }
    return result;
  }
}

// ========== Context passed through call chain ==========

interface WsContext {
  io: Server;
  store: MemoryStore;
  sessionManager: SessionManager;
  memoryExtractor: MemoryExtractor;
  memoryStore: FileMemoryStore;
  taskQueue: AgentTaskQueue;
  abortControllers: Map<string, AbortController[]>;
  projectDocStore: ProjectDocStore;
}

// ========== WebSocket Setup ==========

export function setupWebSocket(io: Server, store: MemoryStore, sessionManager: SessionManager, memoryExtractor: MemoryExtractor, memoryStore: FileMemoryStore, projectDocStore: ProjectDocStore) {
  const ctx: WsContext = { io, store, sessionManager, memoryExtractor, memoryStore, taskQueue: new AgentTaskQueue(), abortControllers: new Map(), projectDocStore };

  function broadcastTaskQueue() {
    const snapshot = ctx.taskQueue.getSnapshot();
    const payload: Record<string, { current: { from: string; summary: string } | null; pending: Array<{ from: string; summary: string }> }> = {};
    for (const [agentId, data] of Object.entries(snapshot)) {
      payload[agentId] = {
        current: data.current ? { from: data.current.fromAgentName, summary: data.current.message.slice(0, 200) } : null,
        pending: data.pending.map(t => ({ from: t.fromAgentName, summary: t.message.slice(0, 200) })),
      };
    }
    io.emit("task-queue", payload);

    for (const agentId of Object.keys(agentConfigs)) {
      const status = agentStatus.get(agentId);
      if (status) {
        const current = ctx.taskQueue.getCurrent(agentId);
        status.currentTask = current ? `【${current.fromAgentName}：${current.message.slice(0, 40)}】` : undefined;
        status.pendingCount = ctx.taskQueue.getPendingCount(agentId);
      }
    }
  }

  io.on("connection", (socket) => {
    console.log(`[WS] 客户端连接: ${socket.id}`);

    socket.emit("agents-status", Object.fromEntries(
      [...agentStatus.entries()].map(([id, s]) => {
        const config = agentConfigs[id];
        return [id, { id, name: config?.name ?? id, avatar: config?.avatar ?? "🐱", status: s.status, message: s.message, currentTask: s.currentTask, pendingCount: s.pendingCount }];
      }),
    ));
    broadcastTaskQueue();

    socket.on("join", (threadId: string) => { socket.join(threadId); });
    socket.on("leave", (threadId: string) => { socket.leave(threadId); });

    // 核心: 发送消息给 Agent
    socket.on("invoke", async (payload: InvokePayload) => {
      const { threadId, message, agents: specifiedAgents } = payload;
      if (!message?.trim()) return;

      const { targetAgents, message: cleanMessage } = route(message, specifiedAgents);
      if (targetAgents.length === 0) return;

      console.log(`[WS] invoke: thread=${threadId}, agents=${targetAgents}, msg=${cleanMessage.slice(0, 50)}`);

      // 确保项目文档存在
      const thread = await ctx.store.getThread(threadId);
      await ctx.projectDocStore.initDoc(threadId, thread?.title ?? "新项目");

      await ctx.store.saveMessage({ threadId, agentId: "user", role: "user", content: cleanMessage });

      const controller = new AbortController();
      if (!ctx.abortControllers.has(threadId)) ctx.abortControllers.set(threadId, []);
      ctx.abortControllers.get(threadId)!.push(controller);

      for (const agentId of targetAgents) {
        ctx.taskQueue.enqueue(agentId, {
          id: `task-${Date.now()}-${agentId}`,
          fromAgentId: null, fromAgentName: "用户",
          message: cleanMessage, status: "pending", enqueuedAt: Date.now(),
          threadId, callerId: null, depth: 1, callChain: [agentId],
        });
      }
      broadcastTaskQueue();

      // 顶层并行：每个 agent 各自消费队列
      Promise.all(targetAgents.map(agentId => drainAgentQueue(ctx, agentId, threadId, controller.signal, broadcastTaskQueue))).then(() => {
        const list = ctx.abortControllers.get(threadId);
        if (list) {
          const idx = list.indexOf(controller);
          if (idx >= 0) list.splice(idx, 1);
          if (list.length === 0) ctx.abortControllers.delete(threadId);
        }
      });
    });

    socket.on("abort", (payload: AbortPayload) => {
      const list = ctx.abortControllers.get(payload.threadId);
      if (list && list.length > 0) {
        for (const c of list) c.abort();
        io.to(payload.threadId).emit("event", { type: "aborted", threadId: payload.threadId });
      }
    });

    socket.on("thread-delete", (threadId: string) => {
      const list = ctx.abortControllers.get(threadId);
      if (list && list.length > 0) {
        for (const c of list) c.abort();
        ctx.abortControllers.delete(threadId);
      }
      ctx.projectDocStore.deleteDoc(threadId);
    });

    socket.on("resume", async (payload: { threadId: string; message?: string }) => {
      const { threadId, message } = payload;
      const resumeMsg = message ?? "请回顾一下之前的工作进展，检查各任务的完成情况，如有未完成的任务请继续推进。";

      await ctx.store.saveMessage({ threadId, agentId: "user", role: "user", content: `[恢复会话] ${resumeMsg}` });

      const controller = new AbortController();
      if (!ctx.abortControllers.has(threadId)) ctx.abortControllers.set(threadId, []);
      ctx.abortControllers.get(threadId)!.push(controller);

      // 恢复会话时广播给所有猫
      for (const agentId of Object.keys(agentConfigs)) {
        ctx.taskQueue.enqueue(agentId, {
          id: `task-${Date.now()}-resume-${agentId}`, fromAgentId: null, fromAgentName: "用户",
          message: resumeMsg, status: "pending", enqueuedAt: Date.now(),
          threadId, callerId: null, depth: 1, callChain: [agentId],
        });
      }
      broadcastTaskQueue();

      (async () => {
        await Promise.all(Object.keys(agentConfigs).map(agentId =>
          drainAgentQueue(ctx, agentId, threadId, controller.signal, broadcastTaskQueue),
        ));
        const list = ctx.abortControllers.get(threadId);
        if (list) {
          const idx = list.indexOf(controller);
          if (idx >= 0) list.splice(idx, 1);
          if (list.length === 0) ctx.abortControllers.delete(threadId);
        }
      })();
    });

    socket.on("disconnect", () => { console.log(`[WS] 客户端断开: ${socket.id}`); });
  });
}

// ========== 队列消费 ==========

async function drainAgentQueue(
  ctx: WsContext, agentId: string, threadId: string,
  signal: AbortSignal, broadcastTaskQueue: () => void,
): Promise<void> {
  while (!signal.aborted) {
    const task = ctx.taskQueue.dequeue(agentId);
    if (!task) break;
    broadcastTaskQueue();

    try {
      await invokeWithA2A(ctx, task.threadId, agentId, task.message, task.callerId, signal, task.depth, task.callChain, broadcastTaskQueue);
    } finally {
      ctx.taskQueue.markDone(agentId);
      broadcastTaskQueue();
    }
  }
}

// ========== Agent 调用 ==========

async function invokeWithA2A(
  ctx: WsContext, threadId: string, agentId: string,
  message: string, callerId: string | null,
  signal: AbortSignal, depth: number, callChain: string[],
  broadcastTaskQueue: () => void,
): Promise<void> {
  if (signal.aborted) return;
  // depth 由入队时按 pair 计算，此处不再检查

  const isA2A = callerId !== null;
  const rawPrompt = isA2A ? buildA2APrompt(callerId, agentId, message) : message;

  // 注入项目文档
  const projectDoc = await ctx.projectDocStore.getDoc(threadId);
  let prompt = projectDoc
    ? `=== 项目文档 ===\n${projectDoc}\n=== 项目文档结束 ===\n\n${rawPrompt}`
    : rawPrompt;

  // 注入长期记忆
  const memoryContext = await ctx.memoryStore.buildMemoryContext(agentId);
  if (memoryContext) {
    prompt = `=== 长期记忆 ===\n${memoryContext}\n=== 长期记忆结束 ===\n\n${prompt}`;
  }

  const agent = pool.get(agentId);
  if (!agent) return;

  const threadSession = getSessionId(agentId, threadId);
  const claudeAgent = agent as import("@cat-noodle/provider-claude").ClaudeProcess;
  if (typeof claudeAgent.switchSession === "function") claudeAgent.switchSession(threadSession ?? null);

  // === Session Chain：事前拦截 ===
  const estimatedNewTokens = Math.ceil(prompt.length / 4);
  const shouldSeal = ctx.sessionManager.shouldSealBeforeSend(agentId, estimatedNewTokens);
  if (shouldSeal) {
    console.log(`[WS] session chain seal: agent=${agentConfigs[agentId]?.name ?? agentId}, thread=${threadId.slice(0, 8)}`);
    agentStatus.set(agentId, { status: "thinking", message: "正在交接上下文...", pendingCount: 0 });
    ctx.io.emit("agent-status-update", { agentId, status: "thinking", message: "正在交接上下文..." });

    // 封印旧 session + sub-agent 生成 digest
    await ctx.sessionManager.seal(agentId, threadId);
    // 重生：构建 bootstrap 内容
    const bootstrapContent = await ctx.sessionManager.bootstrap(agentId, threadId);
    // 杀旧进程，清 session，注入 bootstrap
    if (typeof claudeAgent.resetSession === "function") claudeAgent.resetSession(bootstrapContent);

    ctx.io.to(threadId).emit("event", { type: "sealed", threadId, agentId, message: "session 已封印，新 session 启动" });
  }

  const callerName = callerId ? (agentConfigs[callerId]?.name ?? callerId) : "用户";
  agentStatus.set(agentId, { status: "thinking", message: "正在思考...", currentTask: `【${callerName}：${message.slice(0, 40)}】`, pendingCount: ctx.taskQueue.getPendingCount(agentId) });
  ctx.io.emit("agent-status-update", { agentId, status: "thinking", message: "正在思考...", currentTask: `【${callerName}：${message.slice(0, 40)}】` });
  broadcastTaskQueue();

  const agentText = new Map<string, string>();
  const agentThinking = new Map<string, string>();
  const agentLogs = new Map<string, Array<{ type: string; [key: string]: unknown }>>();

  try {
    for await (const tagged of pool.broadcast(prompt, [agentId], signal)) {
      if (signal.aborted) break;
      const { event } = tagged;

      if (event.type === "assistant") {
        const ae = event as AssistantEvent;
        for (const block of ae.message.content) {
          if (block.type === "text") {
            const text = (block as { text: string }).text;
            const prev = agentText.get(agentId) ?? "";
            const delta = text.startsWith(prev) ? text.slice(prev.length) : text;
            if (delta) {
              agentText.set(agentId, text);
              agentStatus.set(agentId, { status: "streaming", message: "正在回复...", pendingCount: ctx.taskQueue.getPendingCount(agentId) });
              ctx.io.emit("agent-status-update", { agentId, status: "streaming", message: "正在回复..." });
              ctx.io.to(threadId).emit("event", { type: "stream", threadId, agentId, text: delta });
            }
          } else if (block.type === "thinking") {
            const thinking = (block as { thinking: string }).thinking;
            const prev = agentThinking.get(agentId) ?? "";
            const delta = thinking.startsWith(prev) ? thinking.slice(prev.length) : thinking;
            if (delta) {
              agentThinking.set(agentId, thinking);
              const logs = agentLogs.get(agentId) ?? [];
              logs.push({ type: "thinking", text: delta, time: Date.now() });
              agentLogs.set(agentId, logs);
              ctx.io.to(threadId).emit("status-event", { type: "thinking", threadId, agentId, text: delta });
            }
          } else if (block.type === "tool_use") {
            const toolName = (block as { name: string }).name;
            const toolInput = (block as { input: Record<string, unknown> }).input;
            const logs = agentLogs.get(agentId) ?? [];
            logs.push({ type: "tool", name: toolName, input: toolInput, time: Date.now() });
            agentLogs.set(agentId, logs);
            ctx.io.to(threadId).emit("status-event", { type: "tool", threadId, agentId, name: toolName, input: toolInput });
          }
        }
      } else if (event.type === "result") {
        const re = event as ResultEvent;

        if (re.session_id) {
          agent.sessionId = re.session_id;
          saveSessionId(agentId, threadId, re.session_id);
        }

        ctx.io.to(threadId).emit("status-event", {
          type: "token-usage", threadId, agentId,
          cost: re.total_cost_usd,
          inputTokens: re.usage.input_tokens + re.usage.cache_read_input_tokens + re.usage.cache_creation_input_tokens,
          outputTokens: re.usage.output_tokens,
        });

        let finalText = agentText.get(agentId) ?? "";
        const logs = agentLogs.get(agentId);

        // 解析项目文档更新
        const updateMatch = finalText.match(/<<<PROJECT-DOC-UPDATE>>>([\s\S]*?)<<<END-PROJECT-DOC-UPDATE>>>/);
        if (updateMatch) {
          ctx.projectDocStore.mergeUpdate(threadId, agentId, updateMatch[1].trim()).catch((err) =>
            console.error(`[WS] 项目文档更新失败 agent=${agentId}:`, err),
          );
          // 从保存/显示的内容中移除更新块
          finalText = finalText.replace(/<<<PROJECT-DOC-UPDATE>>>[\s\S]*?<<<END-PROJECT-DOC-UPDATE>>>/, "").trim();
        }

        if (finalText) {
          await ctx.store.saveMessage({
            threadId, agentId, role: "assistant", content: finalText,
            processLogs: logs && logs.length > 0 ? logs : undefined,
          });
        }

        ctx.io.to(threadId).emit("event", { type: "complete", threadId, agentId, response: finalText });
        agentStatus.set(agentId, { status: "idle", message: "等待召唤", pendingCount: ctx.taskQueue.getPendingCount(agentId) });
        ctx.io.emit("agent-status-update", { agentId, status: "idle", message: "等待召唤" });

        // 更新 token 状态（用于下次事前检查）
        ctx.sessionManager.updateState(agentId, re);
        // 注册新 session 到 chain（如果是首次或封印后）
        if (re.session_id) {
          ctx.sessionManager.registerNewSession(agentId, threadId, re.session_id);
        }

        ctx.memoryExtractor.maybeExtract(agentId, message, finalText).catch(() => {});

        // === A2A: 入队，不直接调用 ===
        const mentions = parseAgentMentions(finalText, agentId);
        if (mentions.length > 0) {
          for (const targetId of mentions.slice(0, 3)) {
            if (signal.aborted) break;
            const newChain = [...callChain, targetId];
            const pairDepth = computePairDepth(callChain, agentId, targetId);
            if (pairDepth > 15) {
              console.log(`[WS] A2A pair depth ${pairDepth} 超限: ${agentConfigs[agentId]?.name} ↔ ${agentConfigs[targetId]?.name}`);
              continue;
            }
            console.log(`[WS] A2A enqueue: ${agentConfigs[agentId]?.name} → ${agentConfigs[targetId]?.name}, pairDepth=${pairDepth}, chain=${newChain.join("→")}`);

            ctx.taskQueue.enqueue(targetId, {
              id: `task-a2a-${Date.now()}-${targetId}`,
              fromAgentId: agentId, fromAgentName: agentConfigs[agentId]?.name ?? agentId,
              message: finalText, status: "pending", enqueuedAt: Date.now(),
              threadId, callerId: agentId, depth: pairDepth, callChain: newChain,
            });

            const targetStatus = agentStatus.get(targetId);
            agentStatus.set(targetId ?? targetId, {
              status: targetStatus?.status === "idle" ? "queued" : (targetStatus?.status ?? "idle"),
              message: "被呼叫中...", pendingCount: ctx.taskQueue.getPendingCount(targetId),
            });
            ctx.io.emit("agent-status-update", { agentId: targetId, status: "queued", message: "被呼叫中..." });
          }
          broadcastTaskQueue();

          // 并行触发各目标的队列消费
          Promise.all(mentions.slice(0, 3).map(targetId => drainAgentQueue(ctx, targetId, threadId, signal, broadcastTaskQueue))).catch(() => {});
        }

      } else if (event.type === "error") {
        const errMsg = (event as { message: string }).message;
        if (errMsg === "请求已取消") break;
        ctx.io.to(threadId).emit("event", { type: "error", threadId, agentId, message: errMsg });
        agentStatus.set(agentId, { status: "idle", message: "出错", pendingCount: ctx.taskQueue.getPendingCount(agentId) });
        ctx.io.emit("agent-status-update", { agentId, status: "idle", message: "出错" });
      } else if (event.type === "status") {
        const statusEvent = event as { status: string; message: string };
        if (statusEvent.status === "retry") {
          agentStatus.set(agentId, { status: "retry", message: statusEvent.message, pendingCount: ctx.taskQueue.getPendingCount(agentId) });
          ctx.io.emit("agent-status-update", { agentId, status: "retry", message: statusEvent.message });
          ctx.io.to(threadId).emit("event", { type: "retry", threadId, agentId, message: statusEvent.message });
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.log(`[WS] thread ${threadId} aborted`);
    } else {
      console.error(`[WS] invoke error:`, err);
    }
    agentStatus.set(agentId, { status: "idle", message: "等待召唤", pendingCount: ctx.taskQueue.getPendingCount(agentId) });
    ctx.io.emit("agent-status-update", { agentId, status: "idle", message: "等待召唤" });
    ctx.io.to(threadId).emit("event", { type: "aborted", threadId, agentId });
  }
}
