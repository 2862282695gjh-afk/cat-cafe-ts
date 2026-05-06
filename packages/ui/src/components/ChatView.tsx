import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { MessageBubble } from "./MessageBubble";
import { InputBox } from "./InputBox";
import type { Message, StreamEvent, ProcessLog, AgentStatus } from "../types";
import type { Theme } from "../themes";

interface Props {
  threadId: string | null;
  onInvoke: (message: string) => void;
  onStop?: () => void;
  onResume?: (message?: string) => void;
  streamEvents: StreamEvent[];
  agents?: Record<string, AgentStatus>;
  theme?: Theme;
}

/** 每个 agent 独立的流式状态 */
interface AgentStreamState {
  text: string;
  logs: ProcessLog[];
}

export function ChatView({ threadId, onInvoke, onStop, onResume, streamEvents, agents, theme }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef<string | null>(null);
  const processedRef = useRef(0);
  const invokeMessageRef = useRef<(msg: string) => void>(() => {});

  // 多 agent 并行流式状态：每个 agentId 独立
  const [streamingAgents, setStreamingAgents] = useState<Record<string, AgentStreamState>>({});
  const streamStateRef = useRef<Record<string, AgentStreamState>>({});

  // 队列
  const messageQueueRef = useRef<string[]>([]);
  const [queueVersion, setQueueVersion] = useState(0);
  const messageQueue = messageQueueRef.current;

  // 辅助：更新某个 agent 的流式状态
  const updateAgentStream = useCallback((agentId: string, updater: (prev: AgentStreamState) => AgentStreamState) => {
    streamStateRef.current = {
      ...streamStateRef.current,
      [agentId]: updater(streamStateRef.current[agentId] ?? { text: "", logs: [] }),
    };
    setStreamingAgents({ ...streamStateRef.current });
  }, []);

  const removeAgentStream = useCallback((agentId: string) => {
    const next = { ...streamStateRef.current };
    delete next[agentId];
    streamStateRef.current = next;
    setStreamingAgents(next);
  }, []);

  // 发送消息
  const invokeMessage = useCallback((message: string) => {
    if (!threadId) return;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, threadId, agentId: "user", role: "user", content: message, timestamp: Date.now() },
    ]);
    streamStateRef.current = {};
    setStreamingAgents({});
    setIsStreaming(true);
    onInvoke(message);
  }, [threadId, onInvoke]);

  invokeMessageRef.current = invokeMessage;

  // 切换线程时重置
  useEffect(() => {
    if (!threadId) return;
    processedRef.current = 0;
    streamStateRef.current = {};
    setStreamingAgents({});
    setIsStreaming(false);
    messageQueueRef.current = [];
    setQueueVersion((v) => v + 1);
  }, [threadId]);

  // 加载历史消息
  useEffect(() => {
    if (!threadId || loadedRef.current === threadId) return;
    loadedRef.current = threadId;
    setLoading(true);
    api.getMessages(threadId).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [threadId]);

  // 队列消费
  const drainQueue = useCallback(() => {
    const q = messageQueueRef.current;
    if (q.length === 0) return;
    const [next, ...rest] = q;
    messageQueueRef.current = rest;
    setQueueVersion((v) => v + 1);
    invokeMessageRef.current(next);
  }, []);

  // 处理流式事件
  useEffect(() => {
    if (streamEvents.length <= processedRef.current) return;
    for (let i = processedRef.current; i < streamEvents.length; i++) {
      const event = streamEvents[i];
      if (event.threadId && event.threadId !== threadId) continue;
      const agentId = event.agentId ?? "unknown";

      if (event.type === "queued") {
        // no-op
      } else if (event.type === "thinking" && event.text) {
        setIsStreaming(true);
        updateAgentStream(agentId, (prev) => ({
          ...prev,
          logs: [...prev.logs, { type: "thinking", time: Date.now(), text: event.text }],
        }));
      } else if (event.type === "tool") {
        updateAgentStream(agentId, (prev) => ({
          ...prev,
          logs: [...prev.logs, { type: "tool", time: Date.now(), name: event.name, input: event.input }],
        }));
      } else if (event.type === "stream" && event.text) {
        setIsStreaming(true);
        updateAgentStream(agentId, (prev) => ({
          ...prev,
          text: prev.text + event.text,
        }));
      } else if (event.type === "complete") {
        const state = streamStateRef.current[agentId];
        const content = state?.text || event.response || "";
        const logs = state?.logs ?? [];
        // 有内容时才保存消息（空 response 如 PASS 跳过）
        if (content) {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}-${agentId}`,
              threadId: threadId!,
              agentId,
              role: "assistant",
              content,
              timestamp: Date.now(),
              processLogs: logs.length > 0 ? logs : undefined,
            },
          ]);
        }
        removeAgentStream(agentId);
        // 所有 agent 都完成后才结束 streaming
        const remaining = Object.keys(streamStateRef.current);
        if (remaining.length === 0) {
          setIsStreaming(false);
          setTimeout(drainQueue, 100);
        }
      } else if (event.type === "aborted") {
        // 中止可能没有 agentId，需要清除所有活跃的 streaming state
        for (const activeId of Object.keys(streamStateRef.current)) {
          const state = streamStateRef.current[activeId];
          if (state?.text) {
            setMessages((prev) => [
              ...prev,
              {
                id: `assistant-${Date.now()}-${activeId}`,
                threadId: threadId!,
                agentId: activeId,
                role: "assistant",
                content: state.text + "\n\n[已中止]",
                timestamp: Date.now(),
                processLogs: state.logs.length > 0 ? state.logs : undefined,
              },
            ]);
          }
          removeAgentStream(activeId);
        }
        setIsStreaming(false);
        setTimeout(drainQueue, 100);
      } else if (event.type === "error") {
        removeAgentStream(agentId);
        const remaining = Object.keys(streamStateRef.current);
        if (remaining.length === 0) {
          setIsStreaming(false);
          setTimeout(drainQueue, 100);
        }
      }
    }
    processedRef.current = streamEvents.length;
  }, [streamEvents, threadId, drainQueue, updateAgentStream, removeAgentStream]);

  const handleSend = useCallback((message: string) => {
    if (!threadId) return;
    if (isStreaming) {
      messageQueueRef.current = [...messageQueueRef.current, message];
      setQueueVersion((v) => v + 1);
    } else {
      invokeMessage(message);
    }
  }, [threadId, isStreaming, invokeMessage]);

  const handleDequeue = useCallback((index: number) => {
    messageQueueRef.current = messageQueueRef.current.filter((_, i) => i !== index);
    setQueueVersion((v) => v + 1);
  }, []);

  const handlePopQueue = useCallback((index: number, text: string) => {
    messageQueueRef.current = messageQueueRef.current.filter((_, i) => i !== index);
    setQueueVersion((v) => v + 1);
    window.dispatchEvent(new CustomEvent("catcafe:fill-input", { detail: text }));
  }, []);

  const getAgentInfo = (agentId: string) => {
    const a = agents?.[agentId];
    const agentTheme = theme?.agents[agentId];
    return {
      agentName: agentTheme?.name ?? a?.name ?? agentId,
      agentAvatar: agentTheme?.avatar ?? a?.avatar ?? "🐱",
    };
  };

  // 正在 streaming 的 agentId 列表
  const activeStreamIds = Object.keys(streamingAgents);

  // 正在思考但还没出文字的 agent（从 agents prop 判断）
  const thinkingAgents = isStreaming
    ? Object.values(agents ?? {}).filter(
        (a) => (a.status === "thinking" || a.status === "retry") && !streamingAgents[a.id]
      )
    : [];

  if (!threadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-60">
        <span className="text-5xl" style={{ fontFamily: "var(--font-display)" }}>🐱</span>
        <p className="text-theme-muted text-sm" style={{ fontFamily: "var(--font-display)" }}>选择或创建一个对话开始</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-theme-muted text-sm">加载中...</div>}
        {!loading && messages.length === 0 && activeStreamIds.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-70">
            <span className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>🍜</span>
            <span className="text-theme-muted text-sm" style={{ fontFamily: "var(--font-display)" }}>欢迎光临 · 请点餐</span>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} {...getAgentInfo(msg.agentId)} />
        ))}

        {/* 正在思考的 agent（还没出文字） */}
        {thinkingAgents.map((a) => (
          <div key={`thinking-${a.id}`} className="flex items-center gap-2 text-sm mb-2">
            <span className="status-light status-thinking" />
            <span className="text-theme-muted text-xs">{getAgentInfo(a.id).agentName} 正在思考...</span>
          </div>
        ))}

        {/* 每个 agent 独立的流式气泡 */}
        {activeStreamIds.map((agentId) => {
          const state = streamingAgents[agentId];
          if (!state) return null;
          return (
            <MessageBubble
              key={`stream-${agentId}`}
              msg={{
                id: `streaming-${agentId}`,
                threadId,
                agentId,
                role: "assistant",
                content: state.text,
                timestamp: Date.now(),
                processLogs: state.logs.length > 0 ? state.logs : undefined,
              }}
              isStreaming
              showThinkingPlaceholder={!state.text && state.logs.length === 0}
              {...getAgentInfo(agentId)}
            />
          );
        })}

        {messages.length > 0 && <AutoScroll />}
      </div>

      {/* 恢复会话按钮 */}
      {!isStreaming && messages.length > 0 && onResume && (
        <div className="px-3 pt-2">
          <button
            onClick={() => onResume()}
            className="w-full text-xs py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--card)",
              border: "1px dashed var(--border)",
              color: "var(--text-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            🔄 恢复上次会话（继续未完成的工作）
          </button>
        </div>
      )}

      <InputBox
        onSend={handleSend}
        onStop={onStop}
        isStreaming={isStreaming}
        queue={messageQueue}
        onDequeue={handleDequeue}
        onPopQueue={handlePopQueue}
        theme={theme}
      />
    </div>
  );
}

function AutoScroll() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  });
  return <div ref={ref} />;
}
