import type { TrainingPlan, NutritionAdvice } from "./types";
import { DEFAULT_TRAINING_PLAN, DEFAULT_NUTRITION_ADVICE } from "./defaults";
import { TrainingPlanCard } from "./TrainingPlanCard";
import { NutritionAdviceCard } from "./NutritionAdviceCard";
import { SkeletonScreen } from "./shared/SkeletonScreen";

interface FitTrackWidgetPanelProps {
  trainingPlan?: TrainingPlan;
  nutritionAdvice?: NutritionAdvice;
  loading?: boolean;
  error?: string | null;
  onCompleteExercise?: (exerciseId: string, completed: boolean) => void;
  onStartWorkout?: () => void;
  onClose?: () => void;
}

export function FitTrackWidgetPanel({
  trainingPlan = DEFAULT_TRAINING_PLAN,
  nutritionAdvice = DEFAULT_NUTRITION_ADVICE,
  loading = false,
  error = null,
  onCompleteExercise,
  onStartWorkout,
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
        {onClose && (
          <button className="duo-close-btn" onClick={onClose} aria-label="关闭面板">
            ✕
          </button>
        )}
      </div>

      <div className="duo-panel-content">
        {error && (
          <div className="duo-error-banner">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
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
            {nutritionAdvice.mealSuggestions.length > 0 && (
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
