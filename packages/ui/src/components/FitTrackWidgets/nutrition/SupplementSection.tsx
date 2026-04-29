import { memo } from "react";

export const SupplementSection = memo(function SupplementSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="duo-supplement-section">
      <div className="duo-section-header">
        <span className="duo-section-icon" aria-hidden="true">💊</span>
        <span className="duo-section-title">补充剂建议</span>
      </div>
      <div className="duo-supplement-list">
        {items.map((item, i) => (
          <span key={i} className="duo-supplement-chip">{item}</span>
        ))}
      </div>
    </div>
  );
});
