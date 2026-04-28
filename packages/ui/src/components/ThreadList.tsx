import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { ThreadMeta } from "../types";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
  newThreadLabel?: string;
  onDelete?: (threadId: string) => void;
}

export function ThreadList({ activeId, onSelect, refreshKey, newThreadLabel = "新建", onDelete }: Props) {
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getThreads();
      setThreads(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleCreate = async () => {
    try {
      const { threadId } = await api.createThread();
      await load();
      onSelect(threadId);
    } catch (err) {
      console.error("创建线程失败:", err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // 先通知后端中止该线程的 agent
      onDelete?.(id);
      await api.deleteThread(id);
      const updated = await api.getThreads();
      setThreads(updated);
      if (activeId === id) {
        onSelect(updated[0]?.id ?? "");
      }
    } catch (err) {
      console.error("删除线程失败:", err);
    }
  };

  const formatTime = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 菜单区标题 + 点餐按钮 */}
      <div className="p-2.5 border-b border-theme flex items-center justify-between">
        <span className="text-xs font-semibold text-theme-muted tracking-wide">菜单</span>
        <button
          onClick={handleCreate}
          className="order-btn text-theme-user-bubble text-xs px-3 py-1 rounded-md"
        >
          + {newThreadLabel}
        </button>
      </div>

      {/* 对话列表 — 木质菜单项 */}
      <div className="flex-1 overflow-y-auto">
        {loading && threads.length === 0 && (
          <div className="p-4 text-theme-muted text-sm">加载中...</div>
        )}
        {!loading && threads.length === 0 && (
          <div className="p-4 text-theme-muted text-xs text-center">
            还没有菜单<br />
            <span className="opacity-60">点击上方按钮开始</span>
          </div>
        )}
        {threads.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`menu-item w-full flex items-center gap-1 px-3 py-2.5 border-b border-theme hover:bg-theme-card transition-colors group cursor-pointer ${
              t.id === activeId ? "active" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-theme truncate">
                {t.title || "新对话"}
              </div>
              <div className="text-xs text-theme-muted mt-0.5">
                {formatTime(t.lastActivity)}
              </div>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); handleDelete(t.id, e); }}
              className="text-sm text-theme-muted hover:text-red-400 hover:bg-red-900/30 rounded w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 shrink-0 transition-all"
              title="删除对话"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
