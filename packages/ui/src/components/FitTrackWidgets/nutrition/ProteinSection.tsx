import { memo } from "react";
import { ProteinSourceItem } from "./ProteinSourceItem";

interface ProteinSectionProps {
  recommendation: string;
  sources: string[];
}

export const ProteinSection = memo(function ProteinSection({ recommendation, sources }: ProteinSectionProps) {
  if (!recommendation && sources.length === 0) return null;

  return (
    <div className="duo-protein-section">
      <div className="duo-protein-header">
        <span className="duo-section-icon" aria-hidden="true">🥩</span>
        <span className="duo-section-title">蛋白质补充</span>
      </div>
      {recommendation && (
        <p className="duo-protein-recommendation">{recommendation}</p>
      )}
      {sources.length > 0 && (
        <div className="duo-protein-sources">
          {sources.map((source, i) => (
            <ProteinSourceItem key={i} source={source} />
          ))}
        </div>
      )}
    </div>
  );
});
