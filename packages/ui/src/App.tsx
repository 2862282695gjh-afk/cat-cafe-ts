import { useState, useCallback, Component, type ReactNode } from "react";
import { ThreadList } from "./components/ThreadList";
import { ChatView } from "./components/ChatView";
import { AgentPanel } from "./components/AgentPanel";
import { FitTrackWidgetPanel } from "./components/FitTrackWidgets";
import "./components/FitTrackWidgets/styles/index.css";
import { ThemeProvider, useTheme } from "./themes";
import { ramenTheme } from "./themes/ramen";
import { useSocket } from "./hooks/useSocket";
import { useAgents } from "./hooks/useAgents";
import { useFitTrack } from "./hooks/useFitTrack";
import type { StreamEvent, AgentStatus, TaskQueueItem } from "./types";

function loadActiveThread(): string | null {
  try { return localStorage.getItem("catcafe:activeThread"); } catch { return null; }
}
function saveActiveThread(id: string | null) {
  try {
    if (id) localStorage.setItem("catcafe:activeThread", id);
    else localStorage.removeItem("catcafe:activeThread");
  } catch { /* ignore */ }
}

function AppContent() {
  const { theme } = useTheme();
  const [activeThread, setActiveThread] = useState<string | null>(loadActiveThread);
  const [showFitTrack, setShowFitTrack] = useState(false);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [threadRefresh, setThreadRefresh] = useState(0);

  const { agents, refresh: refreshAgents, setFromSocket } = useAgents();
  const [taskQueues, setTaskQueues] = useState<Record<string, { current: { from: string; summary: string } | null; pending: Array<{ from: string; summary: string }> }>>({});
  const fitTrack = useFitTrack();

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    setStreamEvents((prev) => [...prev, event]);
    if (event.type === "agent-status-update") {
      refreshAgents();
    }
  }, [refreshAgents]);

  const handleAgentStatus = useCallback(() => {
    refreshAgents();
  }, [refreshAgents]);

  const handleAgentsStatus = useCallback((data: Record<string, { id: string; name: string; avatar?: string; status: string; message: string; statusMessage?: string; currentTask?: string; pendingCount?: number }>) => {
    const mapped: Record<string, AgentStatus> = {};
    for (const [k, v] of Object.entries(data)) {
      mapped[k] = {
        id: v.id,
        name: v.name,
        avatar: v.avatar ?? v.name === "社珠子" ? "👩‍🦰" : "🐱",
        status: v.status,
        statusMessage: v.statusMessage ?? v.message,
        currentTask: v.currentTask,
        pendingCount: v.pendingCount,
      };
    }
    setFromSocket(mapped);
  }, [setFromSocket]);

  const handleTaskQueue = useCallback((data: Record<string, { current: { from: string; summary: string } | null; pending: Array<{ from: string; summary: string }> }>) => {
    setTaskQueues(data);
  }, []);

  const handleDisconnect = useCallback(() => {
    setStreamEvents((prev) => [
      ...prev,
      { type: "error", threadId: activeThread ?? undefined, message: "网络连接中断，正在重连..." },
    ]);
  }, [activeThread]);

  const handleReconnect = useCallback(() => {
    refreshAgents();
  }, [refreshAgents]);

  const { invoke, abort, resume, deleteThread: socketDeleteThread } = useSocket(activeThread, {
    onEvent: handleStreamEvent,
    onAgentStatus: handleAgentStatus,
    onAgentsStatus: handleAgentsStatus,
    onTaskQueue: handleTaskQueue,
    onDisconnect: handleDisconnect,
    onReconnect: handleReconnect,
  });

  const handleSelect = useCallback((id: string) => {
    const tid = id || null;
    setActiveThread(tid);
    saveActiveThread(tid);
  }, []);

  const handleCreateAndSelect = useCallback((id: string) => {
    setActiveThread(id);
    saveActiveThread(id);
    setThreadRefresh((n) => n + 1);
  }, []);

  return (
    <div className="flex h-screen min-h-0 bg-theme text-theme">
      {/* 左栏：招牌 + 对话列表 */}
      <aside className="w-56 border-r border-theme flex flex-col min-h-0 bg-theme-sidebar">
        <div className="shop-sign p-3">
          <h1 className="text-base font-bold flex items-center gap-1.5" style={{ color: "var(--sign-text)" }}>
            <span>{theme.icon}</span>
            <span>{theme.headerTitle}</span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(240,165,0,0.7)" }}>{theme.headerSubtitle}</p>
        </div>
        <div className="noren" />

        {/* FitTrack 切换按钮 */}
        <button
          onClick={() => setShowFitTrack((v) => !v)}
          className={`mx-3 mt-2 mb-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
            showFitTrack
              ? "text-green-200 bg-green-900/40 border border-green-700/50"
              : "text-theme-muted hover:text-theme-accent hover:bg-theme-card border border-transparent"
          }`}
        >
          <span>🐾</span>
          <span>FitTrack 面板</span>
        </button>

        <ThreadList
          activeId={activeThread}
          onSelect={handleSelect}
          refreshKey={threadRefresh}
          newThreadLabel={theme.newThreadLabel}
          onDelete={socketDeleteThread}
        />
      </aside>

      {/* 中栏：聊天 / FitTrack */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {showFitTrack ? (
          <FitTrackWidgetPanel
            trainingPlan={fitTrack.trainingPlan ?? undefined}
            nutritionAdvice={fitTrack.nutritionAdvice ?? undefined}
            loading={fitTrack.loading}
            error={fitTrack.error}
            onCompleteExercise={(id, completed) => fitTrack.completeExercise(id, completed)}
            onClose={() => setShowFitTrack(false)}
          />
        ) : (
          <div className="flex-1 flex flex-col min-w-0 min-h-0 chat-area">
            <ChatView
              threadId={activeThread}
              onInvoke={invoke}
              onStop={abort}
              onResume={resume}
              streamEvents={streamEvents}
              agents={agents}
              theme={theme}
            />
          </div>
        )}
      </main>

      {/* 右栏：厨房看板 */}
      <aside className="w-64 border-l border-theme flex flex-col min-h-0 bg-theme-sidebar kitchen-board">
        <AgentPanel agents={agents} theme={theme} taskQueues={taskQueues} />
      </aside>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: "#f87171", textAlign: "center" }}>
          <h2>页面出错了</h2>
          <p style={{ fontSize: 14, color: "#999" }}>{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: "" }); window.location.reload(); }}
            style={{ marginTop: 16, padding: "8px 24px", borderRadius: 8, cursor: "pointer" }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider themes={[ramenTheme]}>
        <AppContent />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
