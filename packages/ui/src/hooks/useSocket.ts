/**
 * Socket.IO 连接管理
 *
 * 对应后端 ws/handler.ts 的事件协议
 * 支持断网重连：重连后自动重新 join 当前 thread 房间
 */
import { useEffect, useRef, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

const URL = import.meta.env.VITE_WS_URL ?? "http://localhost:3001";

export function useSocket(
  threadId: string | null,
  callbacks: {
    onMessage?: (msg: { id: string; threadId: string; agentId: string; role: string; content: string; timestamp: number }) => void;
    onEvent?: (event: { type: string; threadId?: string; agentId?: string; text?: string; response?: string; message?: string; cost?: number; inputTokens?: number; outputTokens?: number; name?: string }) => void;
    onAgentStatus?: (data: { agentId: string; status: string; message: string; currentTask?: string }) => void;
    onAgentsStatus?: (data: Record<string, { id: string; name: string; avatar?: string; status: string; message: string; statusMessage?: string; currentTask?: string; pendingCount?: number }>) => void;
    onTaskQueue?: (data: Record<string, { current: { from: string; summary: string } | null; pending: Array<{ from: string; summary: string }> }>) => void;
    onTaskBoard?: (tasks: Array<{ id: string; threadId: string; title: string; description?: string; createdBy: string; createdByName: string; assignee?: string; assigneeName?: string; status: "pending" | "in_progress" | "done"; createdAt: number; completedAt?: number }>) => void;
    onDisconnect?: () => void;
    onReconnect?: () => void;
  },
) {
  const socketRef = useRef<Socket | null>(null);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const socket = io(URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket] connected");
      // 重连后重新加入当前 thread 房间
      const tid = threadIdRef.current;
      if (tid) {
        socket.emit("join", tid);
        console.log(`[Socket] reconnect → re-join ${tid.slice(0, 8)}`);
      }
      cbRef.current.onReconnect?.();
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] disconnected: ${reason}`);
      cbRef.current.onDisconnect?.();
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket] connect error:", err.message);
    });

    socket.on("message", (msg) => cbRef.current.onMessage?.(msg));
    socket.on("event", (event) => cbRef.current.onEvent?.(event));
    socket.on("status-event", (event) => cbRef.current.onEvent?.(event));
    socket.on("agent-status-update", (data) => cbRef.current.onAgentStatus?.(data));
    socket.on("agents-status", (data) => cbRef.current.onAgentsStatus?.(data));
    socket.on("task-queue", (data) => cbRef.current.onTaskQueue?.(data));
    socket.on("task-board", (data) => cbRef.current.onTaskBoard?.(data));

    return () => {
      socket.disconnect();
    };
  }, []);

  // 加入房间（不主动离开，保持接收后台流式事件）
  useEffect(() => {
    if (!threadId || !socketRef.current) return;
    if (socketRef.current.connected) {
      socketRef.current.emit("join", threadId);
    }
  }, [threadId]);

  const invoke = useCallback(
    (message: string, agents?: string[]) => {
      if (!threadId || !socketRef.current) return;
      socketRef.current.emit("invoke", { threadId, message, agents });
    },
    [threadId],
  );

  const abort = useCallback(() => {
    if (!threadId || !socketRef.current) return;
    socketRef.current.emit("abort", { threadId });
  }, [threadId]);

  const resume = useCallback((message?: string) => {
    if (!threadId || !socketRef.current) return;
    socketRef.current.emit("resume", { threadId, message });
  }, [threadId]);

  const deleteThread = useCallback((tid: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("thread-delete", tid);
  }, []);

  return { invoke, abort, resume, deleteThread, socket: socketRef.current };
}
