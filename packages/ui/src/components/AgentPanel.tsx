import { useState } from "react";
import type { AgentStatus } from "../types";
import { type Theme } from "../themes";

interface Props {
  agents: Record<string, AgentStatus>;
  theme: Theme;
  taskQueues?: Record<string, { current: { from: string; summary: string } | null; pending: Array<{ from: string; summary: string }> }>;
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

export function AgentPanel({ agents, theme, taskQueues = {} }: Props) {
  const entries = Object.values(agents);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col shrink-0">
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
    </div>
  );
}
