import { useState, useEffect } from "react";
import type { AgentStatus, BoardTask } from "../types";
import { type Theme } from "../themes";
import { api } from "../api/client";

interface Props {
  agents: Record<string, AgentStatus>;
  theme: Theme;
  taskQueues?: Record<string, { current: { from: string; summary: string } | null; pending: Array<{ from: string; summary: string }> }>;
  boardTasks?: BoardTask[];
  threadId?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "空闲",
  thinking: "思考中",
  streaming: "回复中",
  tool: "使用工具",
  retry: "重试中",
  error: "出错",
  queued: "排队中",
};

export function AgentPanel({ agents, theme, taskQueues = {}, boardTasks = [], threadId }: Props) {
  const entries = Object.values(agents);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [boardExpanded, setBoardExpanded] = useState(true);

  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // 分组任务
  const pendingTasks = boardTasks.filter((t) => t.status === "pending");
  const inProgressTasks = boardTasks.filter((t) => t.status === "in_progress");
  const doneTasks = boardTasks.filter((t) => t.status === "done");

  const getAgentAvatar = (agentId?: string) => {
    if (!agentId) return "🐱";
    return theme.agents[agentId]?.avatar ?? "🐱";
  };

  return (
    <div className="flex flex-col shrink-0 min-h-0 flex-1">
      <div className="p-2.5 border-b border-theme flex items-center gap-1.5" style={{ fontFamily: "var(--font-display)" }}>
        <span className="text-sm">厨房</span>
        <span className="text-xs font-semibold text-theme-muted tracking-wider">店员状态</span>
      </div>
      <div className="p-2 space-y-0.5">
        {entries.length === 0 ? (
          <div className="text-theme-muted text-xs p-2">暂无店员</div>
        ) : (
          entries.map((a) => {
            const agentTheme = theme.agents[a.id];
            const avatar = agentTheme?.avatar ?? a.avatar ?? "🐱";
            const name = agentTheme?.name ?? a.name ?? a.id;
            const title = agentTheme?.title ?? "";
            const colorCls = agentTheme?.color ?? "text-theme";
            const isImage = avatar.startsWith("/");

            const queue = taskQueues[a.id];
            const currentTask = queue?.current ?? null;
            const pendingTasks = queue?.pending ?? [];
            const hasQueue = !!currentTask || pendingTasks.length > 0;
            const isExpanded = expanded[a.id] ?? false;

            return (
              <div key={a.id} className="agent-ticket rounded">
                {/* 第一行：头像 + 名字 + 状态 */}
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 bg-theme-card overflow-hidden ring-1 ring-theme">
                    {isImage ? (
                      <img src={avatar} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm">{avatar}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-medium ${colorCls}`}>{name}</span>
                      {title && (
                        <span className="text-[9px] text-theme-muted opacity-60">{title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`status-light status-${a.status === "queued" ? "thinking" : a.status}`} />
                      <span className="text-[10px] text-theme-muted whitespace-nowrap">
                        {STATUS_LABEL[a.status] ?? a.statusMessage}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 任务队列区域：可折叠下拉 */}
                {hasQueue && (
                  <div className="px-2 pb-1.5">
                    <button
                      onClick={() => toggleExpand(a.id)}
                      className="w-full text-left text-[10px] px-2 py-1 rounded flex items-center justify-between transition-colors"
                      style={{ background: "rgba(44, 36, 24, 0.04)", border: "1px solid var(--border)" }}
                    >
                      <span className="text-theme-accent truncate flex-1 mr-1">
                        {currentTask ? `${currentTask.from}：${currentTask.summary}` : `${pendingTasks.length} 个任务等待中`}
                      </span>
                      <span className="text-theme-muted shrink-0">
                        {pendingTasks.length > 0 && <span className="mr-1 opacity-60">+{pendingTasks.length}</span>}
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* 展开的任务列表 */}
                    <div
                      className="overflow-hidden transition-all duration-200"
                      style={{
                        maxHeight: isExpanded ? "200px" : "0px",
                        opacity: isExpanded ? 1 : 0,
                      }}
                    >
                      <div className="mt-1 px-2 py-1.5 rounded space-y-1" style={{ background: "rgba(44, 36, 24, 0.04)", border: "1px dashed var(--border)" }}>
                        {/* 当前任务 */}
                        {currentTask && (
                          <div className="flex items-start gap-1.5">
                            <span className="status-light status-streaming mt-0.5 shrink-0" />
                            <span className="text-[10px] text-theme-accent break-all">
                              {currentTask.from}：{currentTask.summary}
                            </span>
                          </div>
                        )}
                        {/* 待处理任务 */}
                        {pendingTasks.map((task, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="status-light status-idle mt-0.5 shrink-0" />
                            <span className="text-[10px] text-theme-muted break-all">
                              {task.from}：{task.summary}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 任务看板 */}
      {boardTasks.length > 0 && (
        <div className="border-t border-theme">
          <button
            onClick={() => setBoardExpanded(!boardExpanded)}
            className="w-full px-2.5 py-2 flex items-center justify-between text-xs text-theme-muted hover:text-theme transition-colors"
          >
            <span className="flex items-center gap-1.5" style={{ fontFamily: "var(--font-display)" }}>
              <span>📋</span>
              <span>任务看板</span>
              <span className="text-[10px] opacity-60">
                {pendingTasks.length + inProgressTasks.length} 进行中 · {doneTasks.length} 完成
              </span>
            </span>
            <span className="text-[10px]">{boardExpanded ? "▲" : "▼"}</span>
          </button>

          {boardExpanded && (
            <div className="px-2 pb-2 space-y-1 max-h-64 overflow-y-auto">
              {/* 进行中 */}
              {inProgressTasks.map((t) => (
                <div key={t.id} className="task-card rounded px-2 py-1.5 flex items-start gap-1.5"
                  style={{ borderLeft: "3px solid var(--accent)", background: "rgba(199, 139, 46, 0.08)" }}
                >
                  <span className="text-[10px] mt-0.5">{getAgentAvatar(t.assignee)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-theme font-medium truncate">{t.title}</div>
                    <div className="text-[9px] text-theme-muted">
                      {t.assigneeName ?? "未分配"} · {t.createdByName}创建
                    </div>
                  </div>
                  <span className="text-[9px] text-amber-500 shrink-0">进行中</span>
                </div>
              ))}

              {/* 待办 */}
              {pendingTasks.map((t) => (
                <div key={t.id} className="task-card rounded px-2 py-1.5 flex items-start gap-1.5"
                  style={{ borderLeft: "3px solid var(--border)" }}
                >
                  <span className="text-[10px] mt-0.5">{getAgentAvatar(t.assignee)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-theme truncate">{t.title}</div>
                    <div className="text-[9px] text-theme-muted">
                      {t.assigneeName ? `→ ${t.assigneeName}` : "待分配"} · {t.createdByName}创建
                    </div>
                  </div>
                  <span className="text-[9px] text-theme-muted shrink-0">待办</span>
                </div>
              ))}

              {/* 已完成 */}
              {doneTasks.map((t) => (
                <div key={t.id} className="task-card rounded px-2 py-1.5 flex items-start gap-1.5 opacity-50"
                  style={{ borderLeft: "3px solid #4ade80" }}
                >
                  <span className="text-[10px] mt-0.5">{getAgentAvatar(t.assignee)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-theme line-through truncate">{t.title}</div>
                    <div className="text-[9px] text-theme-muted">{t.assigneeName ?? "?"} · 已完成</div>
                  </div>
                  <span className="text-[9px] text-green-500 shrink-0">✓</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
