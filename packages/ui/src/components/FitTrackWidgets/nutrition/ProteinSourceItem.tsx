import { memo } from "react";

export const ProteinSourceItem = memo(function ProteinSourceItem({ source }: { source: string }) {
  return (
    <div className="duo-protein-source-item">
      <span className="duo-protein-dot" />
      <span className="duo-protein-source-text">{source}</span>
    </div>
  );
});
