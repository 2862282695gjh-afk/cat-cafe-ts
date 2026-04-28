import { useState } from "react";
import type { NutritionAdvice, MealSuggestion } from "./types";

interface NutritionAdviceCardProps {
  advice: NutritionAdvice;
}

const MEAL_COLORS = ["#FFC800", "#FF9600", "#1CB0F6"];

function MealCard({ meal, index }: { meal: MealSuggestion; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const color = MEAL_COLORS[index % MEAL_COLORS.length];

  return (
    <div className="duo-meal-card" style={{ borderLeftColor: color }}>
      <button className="duo-meal-header" onClick={() => setExpanded(!expanded)}>
        <div className="duo-meal-rank" style={{ backgroundColor: color }}>
          {index + 1}
        </div>
        <div className="duo-meal-info">
          <span className="duo-meal-name">{meal.name}</span>
          <span className="duo-meal-meta">
            {meal.calories} kcal · {meal.protein}g 蛋白质
          </span>
        </div>
        <span className={`duo-meal-expand ${expanded ? "open" : ""}`}>▾</span>
      </button>
      {expanded && (
        <div className="duo-meal-detail">
          <p className="duo-meal-desc">{meal.description}</p>
          <div className="duo-macro-inline">
            <span className="duo-macro-chip" style={{ color: "#CE82FF" }}>
              💪 {meal.protein}g 蛋白质
            </span>
            <span className="duo-macro-chip" style={{ color: "#FFC800" }}>
              🔥 {meal.calories} kcal
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ProteinSourceItem({ source }: { source: string }) {
  return (
    <div className="duo-protein-source-item">
      <span className="duo-protein-dot" />
      <span className="duo-protein-source-text">{source}</span>
    </div>
  );
}

export function NutritionAdviceCard({ advice }: NutritionAdviceCardProps) {
  const { proteinRecommendation, proteinSources, hydrationTips, mealSuggestions, supplementRecommendations } = advice;

  return (
    <div className="duo-card duo-nutrition-card">
      {/* 头部 */}
      <div className="duo-card-header">
        <div className="duo-header-left">
          <h3 className="duo-card-title">🥗 AI 饮食建议</h3>
          <span className="duo-ai-tag">AI 生成</span>
        </div>
      </div>

      {/* 蛋白质推荐 */}
      {(proteinRecommendation || proteinSources.length > 0) && (
        <div className="duo-protein-section">
          <div className="duo-protein-header">
            <span className="duo-section-icon">🥩</span>
            <span className="duo-section-title">蛋白质补充</span>
          </div>
          {proteinRecommendation && (
            <p className="duo-protein-recommendation">{proteinRecommendation}</p>
          )}
          {proteinSources.length > 0 && (
            <div className="duo-protein-sources">
              {proteinSources.map((source, i) => (
                <ProteinSourceItem key={i} source={source} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 推荐餐食 */}
      <div className="duo-meal-section">
        <div className="duo-section-header">
          <span className="duo-section-icon">🍽️</span>
          <span className="duo-section-title">推荐餐食</span>
          <span className="duo-section-count">{mealSuggestions.length} 道</span>
        </div>
        <div className="duo-meal-list">
          {mealSuggestions.map((meal, i) => (
            <MealCard key={i} meal={meal} index={i} />
          ))}
        </div>
      </div>

      {/* 补充剂建议（可选） */}
      {supplementRecommendations && supplementRecommendations.length > 0 && (
        <div className="duo-supplement-section">
          <div className="duo-section-header">
            <span className="duo-section-icon">💊</span>
            <span className="duo-section-title">补充剂建议</span>
          </div>
          <div className="duo-supplement-list">
            {supplementRecommendations.map((item, i) => (
              <span key={i} className="duo-supplement-chip">{item}</span>
            ))}
          </div>
        </div>
      )}

      {/* 饮水提示 */}
      <div className="duo-hydration-section">
        <div className="duo-hydration-content">
          <span className="duo-hydration-icon">💧</span>
          <p className="duo-hydration-text">{hydrationTips}</p>
        </div>
      </div>
    </div>
  );
}
