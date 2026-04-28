import { TrainingPlanCard } from "./TrainingPlanCard";
import { NutritionAdviceCard } from "./NutritionAdviceCard";
import type { TrainingPlan, NutritionAdvice } from "./types";

const DEFAULT_TRAINING_PLAN: TrainingPlan = {
  id: "plan-default",
  name: "今日训练",
  goal: "general",
  totalXP: 0,
  streak: 0,
  progress: 0,
  exercises: [],
};

const DEFAULT_NUTRITION_ADVICE: NutritionAdvice = {
  proteinRecommendation: "暂无建议",
  proteinSources: [],
  hydrationTips: "保持充足饮水",
  mealSuggestions: [],
};

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
      {/* 面板头部 */}
      <div className="duo-panel-header">
        <div className="duo-panel-brand">
          <span className="duo-brand-owl">🐱</span>
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

      {/* 小部件内容区 */}
      <div className="duo-panel-content">
        {error && (
          <div className="duo-error-banner">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="duo-loading-state">
            <div className="duo-loading-spinner" />
            <span>加载中...</span>
          </div>
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

      {/* 底部信息 */}
      <div className="duo-panel-footer">
        <span>由 AI 营养师生成</span>
      </div>
    </div>
  );
}
