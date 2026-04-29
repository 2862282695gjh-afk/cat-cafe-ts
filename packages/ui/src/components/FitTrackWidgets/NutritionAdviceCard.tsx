import { memo } from "react";
import type { NutritionAdvice } from "./types";
import { ProteinSection } from "./nutrition/ProteinSection";
import { MealCard } from "./nutrition/MealCard";
import { SupplementSection } from "./nutrition/SupplementSection";
import { HydrationSection } from "./nutrition/HydrationSection";

export const NutritionAdviceCard = memo(function NutritionAdviceCard({ advice }: { advice: NutritionAdvice }) {
  const { proteinRecommendation, proteinSources, hydrationTips, mealSuggestions, supplementRecommendations } = advice;

  return (
    <div className="duo-card duo-nutrition-card">
      <div className="duo-card-header">
        <div className="duo-header-left">
          <h3 className="duo-card-title">
            <span aria-hidden="true">🥗 </span>AI 饮食建议
          </h3>
          <span className="duo-ai-tag">AI 生成</span>
        </div>
      </div>

      <ProteinSection recommendation={proteinRecommendation} sources={proteinSources} />

      <div className="duo-meal-section">
        <div className="duo-section-header">
          <span className="duo-section-icon" aria-hidden="true">🍽️</span>
          <span className="duo-section-title">推荐餐食</span>
          <span className="duo-section-count">{mealSuggestions.length} 道</span>
        </div>
        <div className="duo-meal-list">
          {mealSuggestions.map((meal, i) => (
            <MealCard key={i} meal={meal} index={i} />
          ))}
        </div>
      </div>

      <SupplementSection items={supplementRecommendations ?? []} />

      <HydrationSection tips={hydrationTips} />
    </div>
  );
});
