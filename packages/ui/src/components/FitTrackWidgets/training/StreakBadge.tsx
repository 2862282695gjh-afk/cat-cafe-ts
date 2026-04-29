import { memo } from "react";

export const StreakBadge = memo(function StreakBadge({ streak }: { streak: number }) {
  return (
    <div className="duo-streak-badge duo-tooltip" data-tooltip="连续打卡天数">
      <span className="duo-streak-flame" role="img" aria-hidden="true">🔥</span>
      <span className="duo-streak-count">{streak}</span>
      <span className="duo-streak-label">天连胜</span>
    </div>
  );
});
