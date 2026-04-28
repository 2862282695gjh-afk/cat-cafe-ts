import { useState } from "react";
import type { Message, ProcessLog } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  msg: Message;
  agentName?: string;
  agentAvatar?: string;
  isStreaming?: boolean;
  showThinkingPlaceholder?: boolean;
}

const AGENT_THEMES: Record<string, { color: string; ring: string; border: string }> = {
  tamako: { color: "text-amber-300",  ring: "ring-amber-700/50",  border: "border-amber-700/50" },
  sasaki: { color: "text-sky-300",    ring: "ring-sky-700/50",    border: "border-sky-700/50" },
  bunzo:  { color: "text-orange-300", ring: "ring-orange-700/50", border: "border-orange-700/50" },
  kohana: { color: "text-emerald-300",ring: "ring-emerald-700/50",border: "border-emerald-700/50" },
  opus:   { color: "text-orange-400", ring: "ring-orange-800/40", border: "border-orange-800/60" },
};

function getAgentTheme(agentId: string) {
  return AGENT_THEMES[agentId] ?? { color: "text-amber-300", ring: "ring-amber-800/40", border: "border-amber-800/60" };
}

const TOOL_SUMMARY: Record<string, (input?: Record<string, unknown>) => string> = {
  Bash: (i) => `Bash: ${i?.command ?? ""}`,
  Read: (i) => `Read: ${(i?.file_path as string)?.split("/").pop() ?? ""}`,
  Write: (i) => `Write: ${(i?.file_path as string)?.split("/").pop() ?? ""}`,
  Edit: (i) => `Edit: ${(i?.file_path as string)?.split("/").pop() ?? ""}`,
  Grep: (i) => `Grep: "${i?.pattern ?? ""}"`,
  Glob: (i) => `Glob: ${i?.pattern ?? ""}`,
};

function getToolLabel(name?: string): string {
  if (!name) return "未知工具";
  if (name.startsWith("mcp__")) return name.replace(/^mcp__/, "").split("__").join(" › ");
  return name;
}

function getToolSummary(name?: string, input?: Record<string, unknown>): string {
  if (!name) return "";
  const fn = TOOL_SUMMARY[name];
  return fn ? fn(input) : "";
}

function ToolCard({ log }: { log: ProcessLog }) {
  const [expanded, setExpanded] = useState(false);
  const label = getToolLabel(log.name);
  const summary = getToolSummary(log.name, log.input);
  const hasInput = log.input && Object.keys(log.input).length > 0 && !summary;

  return (
    <div className="tool-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:opacity-80 transition-opacity"
      >
        <span className="text-amber-500">🔧</span>
        <span className="text-amber-300 font-medium">{label}</span>
        {summary && <span className="text-theme-muted truncate ml-1 text-[10px]">{summary}</span>}
        {hasInput && (
          <span className="ml-auto text-theme-muted text-[10px]">{expanded ? "▲" : "▼"}</span>
        )}
      </button>
      {expanded && hasInput && (
        <div className="px-2.5 pb-2 border-t border-theme">
          <pre className="text-[10px] text-theme-muted mt-1.5 whitespace-pre-wrap break-all max-h-32 overflow-y-auto rounded p-1.5" style={{ background: "rgba(26,15,6,0.6)" }}>
            {JSON.stringify(log.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ProcessLogsPanel({ logs, live, theme }: { logs: ProcessLog[]; live?: boolean; theme: { border: string } }) {
  const [expanded, setExpanded] = useState(true);

  if (logs.length === 0) return null;

  return (
    <div className="thinking-panel mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-theme-muted hover:text-theme transition-colors"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        {live && <span className="status-light status-in_progress" />}
        <span>{live ? "实时思考" : "思考过程"}</span>
        <span className="text-theme-muted opacity-50">({logs.length})</span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 space-y-1 max-h-64 overflow-y-auto">
          {logs.map((log, idx) =>
            log.type === "tool" ? (
              <ToolCard key={idx} log={log} />
            ) : (
              <div key={idx} className="flex items-start gap-2 text-xs">
                <span className="text-sky-400 shrink-0">💭</span>
                <span className="text-theme-muted opacity-70 whitespace-pre-wrap break-words leading-relaxed text-[11px]">
                  {log.text}
                </span>
              </div>
            ),
          )}
          {live && (
            <div className="text-theme-muted animate-pulse text-xs">...</div>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingPlaceholder({ theme }: { theme: { color: string } }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 text-sm">
      <span className={`status-light status-thinking`} />
      <span className="text-theme-muted text-xs">正在思考</span>
    </div>
  );
}

export function MessageBubble({ msg, agentName, agentAvatar, isStreaming, showThinkingPlaceholder }: Props) {
  const isUser = msg.role === "user";
  const theme = getAgentTheme(msg.agentId);
  const time = new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""} mb-3`}>
      {/* 头像 */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden ${
        isUser ? "bg-theme-card ring-1 ring-theme" : `bg-theme-card ring-1 ${theme.ring}`
      }`}>
        {isUser ? "👤" : (agentAvatar?.startsWith("/") ? <img src={agentAvatar} alt="" className="w-full h-full object-cover" /> : (agentAvatar ?? "🐱"))}
      </div>

      <div className={`max-w-[75%] ${isUser ? "items-end" : ""}`}>
        {/* 名字 + 时间 */}
        <div className="text-[10px] mb-0.5">
          {isUser ? (
            <span className="text-theme-muted">你 · {time}</span>
          ) : (
            <span>
              <span className={theme.color}>{agentName ?? msg.agentId}</span>
              <span className="text-theme-muted"> · {time}</span>
            </span>
          )}
        </div>

        {/* 思考过程 / 工具调用 */}
        {!isUser && msg.processLogs && msg.processLogs.length > 0 && (
          <ProcessLogsPanel logs={msg.processLogs} live={isStreaming} theme={theme} />
        )}

        {/* 思考占位 */}
        {!isUser && showThinkingPlaceholder && <ThinkingPlaceholder theme={theme} />}

        {/* 消息内容 */}
        {msg.content && (
          <div className={isUser ? "bubble-user px-3 py-2 text-sm break-words whitespace-pre-wrap" : "bubble-agent px-3 py-2 text-sm break-words"}>
            {isUser ? (
              msg.content
            ) : (
              <MarkdownRenderer content={msg.content} isStreaming={isStreaming} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
