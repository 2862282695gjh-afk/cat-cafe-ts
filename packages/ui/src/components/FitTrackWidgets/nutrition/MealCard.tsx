import { useState, memo, useMemo, useId } from "react";
import type { MealSuggestion } from "../types";

interface MealCardProps {
  meal: MealSuggestion;
  index: number;
}

export const MealCard = memo(function MealCard({ meal, index }: MealCardProps) {
  const [expanded, setExpanded] = useState(false);
  const headerId = useId();
  const detailId = useId();
  const mealCardClass = `duo-meal-card duo-meal-card-${index % 3}` as const;

  return (
    <div className={mealCardClass}>
      <button
        className="duo-meal-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={detailId}
        id={headerId}
      >
        <div className="duo-meal-rank">{index + 1}</div>
        <div className="duo-meal-info">
          <span className="duo-meal-name">{meal.name}</span>
          <span className="duo-meal-meta">
            {meal.calories} kcal · {meal.protein}g 蛋白质
          </span>
        </div>
        <span className={`duo-meal-expand ${expanded ? "open" : ""}`}>▾</span>
      </button>
      <div
        id={detailId}
        role="region"
        aria-labelledby={headerId}
        className={`duo-meal-detail-wrapper ${expanded ? "open" : ""}`}
      >
        <div className="duo-meal-detail">
          <div className="duo-meal-detail-inner">
            <p className="duo-meal-desc">{meal.description}</p>
            <div className="duo-macro-inline">
              <span className="duo-macro-chip" style={{ color: "var(--duo-purple)" }}>
                <span aria-hidden="true">💪</span> {meal.protein}g 蛋白质
              </span>
              <span className="duo-macro-chip" style={{ color: "var(--duo-gold)" }}>
                <span aria-hidden="true">🔥</span> {meal.calories} kcal
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
