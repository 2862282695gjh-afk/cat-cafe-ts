import { useState, useEffect, useRef } from "react";
import type { Theme } from "../themes";

interface Props {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  queue?: string[];
  onDequeue?: (index: number) => void;
  onPopQueue?: (index: number, text: string) => void;
  disabled?: boolean;
  theme?: Theme;
}

const MENTION_AGENTS = [
  { id: "sasaki", names: ["佐佐木", "sasaki"], label: "佐佐木 (前端)" },
  { id: "bunzo", names: ["文藏", "bunzo"], label: "文藏 (后端)" },
  { id: "kohana", names: ["小花", "kohana", "品控"], label: "小花 (QA)" },
  { id: "sabu", names: ["萨布", "撒布", "sabu"], label: "萨布 (文档)" },
];

export function InputBox({ onSend, onStop, isStreaming, queue, onDequeue, onPopQueue, disabled, theme }: Props) {
  const [text, setText] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionFilter, setMentionFilter] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredAgents = MENTION_AGENTS.filter(
    (a) =>
      a.names.some((n) => n.toLowerCase().includes(mentionFilter.toLowerCase())) ||
      a.label.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (typeof msg === "string") {
        setText(msg);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("catcafe:fill-input", handler);
    return () => window.removeEventListener("catcafe:fill-input", handler);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fff\-]*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (agent: (typeof MENTION_AGENTS)[0]) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = text.slice(0, cursorPos);
    const textAfter = text.slice(cursorPos);

    const newText = textBefore.replace(/@([\w\u4e00-\u9fff\-]*)$/, `@${agent.names[0]} `) + textAfter;
    setText(newText);
    setShowMentions(false);

    const newCursorPos = textBefore.replace(/@([\w\u4e00-\u9fff\-]*)$/, `@${agent.names[0]} `).length;
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = newCursorPos;
      textarea.focus();
    });
  };

  const handleSubmit = () => {
    const msg = text.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setText("");
    setShowMentions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "ArrowUp" && !text && queue && queue.length > 0 && onPopQueue) {
      e.preventDefault();
      onPopQueue(queue.length - 1, queue[queue.length - 1]);
    }
  };

  const handleUpClick = (index: number) => {
    if (onPopQueue) onPopQueue(index, queue![index]);
  };

  const getAgentAvatar = (agentId: string) => {
    const agentTheme = theme?.agents[agentId];
    return agentTheme?.avatar ?? "🐱";
  };

  return (
    <div className="border-t border-theme p-3 relative">
      {/* @mention 下拉 — 日式卡片风格 */}
      {showMentions && filteredAgents.length > 0 && (
        <div className="mention-dropdown absolute bottom-full left-3 right-3 mb-1 rounded-lg shadow-xl overflow-hidden z-50">
          {filteredAgents.map((agent, idx) => (
            <button
              key={agent.id}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ${
                idx === mentionIndex ? "active" : "text-theme-muted"
              }`}
              onClick={() => insertMention(agent)}
              onMouseEnter={() => setMentionIndex(idx)}
            >
              <span className="text-base">{getAgentAvatar(agent.id)}</span>
              <span>{agent.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 排队消息 */}
      {queue && queue.length > 0 && (
        <div className="mb-2 space-y-1">
          {queue.map((msg, idx) => (
            <div
              key={idx}
              className="queue-item flex items-center gap-1 px-2.5 py-1.5 text-xs group"
            >
              <span className="text-theme-muted mr-1">{idx + 1}</span>
              <span className="flex-1 text-theme truncate">{msg}</span>
              <button
                onClick={() => handleUpClick(idx)}
                className="text-theme-muted hover:text-theme px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="⬆️ 吐回输入框编辑"
              >
                ⬆️
              </button>
              <button
                onClick={() => onDequeue?.(idx)}
                className="text-theme-muted hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="移除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区 — 柜台点餐口 */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "输入消息... (Enter 排队, ⬆️ 回填)"
              : "点餐中... (@ 提及猫咪, Enter 发送)"
          }
          rows={2}
          className="counter-input flex-1 px-3 py-2 text-sm placeholder:text-theme-muted resize-none focus:outline-none"
          style={{ background: "var(--input-bg)", color: "var(--text)" }}
        />
        <button
          onClick={isStreaming ? onStop : handleSubmit}
          disabled={!isStreaming && (disabled || !text.trim())}
          className="lantern-btn px-4 rounded-lg text-sm flex items-center gap-1"
          style={{ color: "var(--user-bubble-text)" }}
        >
          {isStreaming ? <><span>⏹</span><span>停止</span></> : "🍜 发送"}
        </button>
      </div>
    </div>
  );
}
