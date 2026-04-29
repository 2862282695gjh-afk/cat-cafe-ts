import type { TrainingPlan, NutritionAdvice } from "./types";
import { DEFAULT_TRAINING_PLAN, DEFAULT_NUTRITION_ADVICE } from "./defaults";
import { TrainingPlanCard } from "./TrainingPlanCard";
import { NutritionAdviceCard } from "./NutritionAdviceCard";
import { SkeletonScreen } from "./shared/SkeletonScreen";

function hasNutritionContent(advice: NutritionAdvice): boolean {
  return !!(
    advice.proteinRecommendation ||
    (advice.proteinSources && advice.proteinSources.length > 0) ||
    advice.hydrationTips ||
    (advice.mealSuggestions && advice.mealSuggestions.length > 0) ||
    (advice.supplementRecommendations && advice.supplementRecommendations.length > 0)
  );
}

interface FitTrackWidgetPanelProps {
  trainingPlan?: TrainingPlan;
  nutritionAdvice?: NutritionAdvice;
  loading?: boolean;
  error?: string | null;
  onCompleteExercise?: (exerciseId: string, completed: boolean) => void;
  onStartWorkout?: () => void;
  onRefresh?: () => void;
  onClose?: () => void;
}

export function FitTrackWidgetPanel({
  trainingPlan = DEFAULT_TRAINING_PLAN,
  nutritionAdvice = DEFAULT_NUTRITION_ADVICE,
  loading = false,
  error = null,
  onCompleteExercise,
  onStartWorkout,
  onRefresh,
  onClose,
}: FitTrackWidgetPanelProps) {
  return (
    <div className="duo-widget-panel">
      <div className="duo-panel-header">
        <div className="duo-panel-brand">
          <span className="duo-brand-owl" aria-hidden="true">🐱</span>
          <div>
            <h2 className="duo-panel-title">FitTrack</h2>
            <p className="duo-panel-subtitle">今日健康面板</p>
          </div>
        </div>
        <div className="duo-panel-actions">
          {onRefresh && (
            <button
              className="duo-refresh-btn"
              onClick={onRefresh}
              aria-label="刷新数据"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}
          {onClose && (
            <button className="duo-close-btn" onClick={onClose} aria-label="关闭面板" type="button">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="duo-panel-content">
        {error && (
          <div className="duo-error-banner">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
            {onRefresh && (
              <button
                className="duo-error-retry-btn"
                onClick={onRefresh}
                type="button"
              >
                重试
              </button>
            )}
          </div>
        )}

        {loading ? (
          <SkeletonScreen />
        ) : (
          <>
            <TrainingPlanCard
              plan={trainingPlan}
              onComplete={onCompleteExercise}
              onStartWorkout={onStartWorkout}
            />
            {hasNutritionContent(nutritionAdvice) && (
              <NutritionAdviceCard advice={nutritionAdvice} />
            )}
          </>
        )}
      </div>

      <div className="duo-panel-footer">
        <span>由 AI 营养师生成</span>
      </div>
    </div>
  );
}
