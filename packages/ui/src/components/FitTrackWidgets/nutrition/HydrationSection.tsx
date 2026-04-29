import { memo } from "react";

export const HydrationSection = memo(function HydrationSection({ tips }: { tips: string }) {
  return (
    <div className="duo-hydration-section">
      <div className="duo-hydration-content">
        <span className="duo-hydration-icon" aria-hidden="true">💧</span>
        <p className="duo-hydration-text">{tips}</p>
      </div>
    </div>
  );
});
