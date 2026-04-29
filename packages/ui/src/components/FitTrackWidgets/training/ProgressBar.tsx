import { memo } from "react";

export const ProgressBar = memo(function ProgressBar({ value, color = "var(--duo-green)" }: { value: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className="duo-progress-track"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`训练进度 ${Math.round(clamped)}%`}
    >
      <div
        className="duo-progress-fill"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      >
        <div className="duo-progress-highlight" />
      </div>
    </div>
  );
});
