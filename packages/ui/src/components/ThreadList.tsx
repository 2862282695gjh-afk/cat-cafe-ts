import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { ThreadMeta, Project } from "../types";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
  newThreadLabel?: string;
  onDelete?: (threadId: string) => void;
}

export function ThreadList({ activeId, onSelect, refreshKey, newThreadLabel = "新建", onDelete }: Props) {
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, projs] = await Promise.all([api.getThreads(), api.getProjects()]);
      setThreads(list);
      setProjects(projs);
    } catch {
      // projects 可能还不存在，忽略
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleCreate = async (projectId?: string) => {
    try {
      const { threadId } = await api.createThread(undefined, projectId);
      setShowProjectPicker(false);
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

  const getProjectName = (projectId?: string) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name ?? null;
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* 菜单区标题 + 点餐按钮 */}
      <div className="p-2.5 border-b border-theme flex items-center justify-between">
        <span className="text-xs font-semibold text-theme-muted tracking-wide">菜单</span>
        <button
          onClick={() => setShowProjectPicker(true)}
          className="order-btn text-theme-user-bubble text-xs px-3 py-1 rounded-md"
        >
          + {newThreadLabel}
        </button>
      </div>

      {/* 项目选择弹窗 */}
      {showProjectPicker && (
        <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center">
          <div className="bg-theme-card border border-theme rounded-lg p-4 mx-4 w-72 max-w-full shadow-xl">
            <div className="text-sm text-theme font-semibold mb-3">选择项目</div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                onClick={() => handleCreate()}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-theme hover:bg-theme-border transition-colors"
              >
                不绑定项目
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleCreate(p.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-theme-border transition-colors"
                >
                  <div className="text-sm text-theme flex items-center gap-1.5">
                    {p.name}
                    {p.catReadmePath
                      ? <span className="text-[10px] text-green-500">doc ✓</span>
                      : <span className="text-[10px] text-amber-500">no doc</span>
                    }
                  </div>
                  <div className="text-xs text-theme-muted truncate">{p.path}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowProjectPicker(false)}
              className="mt-3 w-full text-xs text-theme-muted hover:text-theme py-1.5"
            >
              取消
            </button>
          </div>
        </div>
      )}

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
              <div className="text-xs text-theme-muted mt-0.5 flex items-center gap-1.5">
                {getProjectName(t.projectId) && (
                  <span className="inline-block px-1 py-px rounded text-[10px] bg-theme-border text-theme-muted">
                    {getProjectName(t.projectId)}
                  </span>
                )}
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
