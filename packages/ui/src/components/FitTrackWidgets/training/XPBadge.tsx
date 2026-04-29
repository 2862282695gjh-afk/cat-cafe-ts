import { memo } from "react";

export const XPBadge = memo(function XPBadge({ xp }: { xp: number }) {
  return (
    <div className="duo-xp-badge duo-tooltip" data-tooltip="训练经验值">
      <span className="duo-xp-icon" role="img" aria-hidden="true">⚡</span>
      <span className="duo-xp-count">{xp}</span>
      <span className="duo-xp-label">XP</span>
    </div>
  );
});
