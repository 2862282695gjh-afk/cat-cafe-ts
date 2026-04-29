import type { TrainingPlan, NutritionAdvice } from "./types";

export const DEFAULT_TRAINING_PLAN: TrainingPlan = {
  id: "plan-default",
  name: "今日训练",
  goal: "general",
  totalXP: 0,
  streak: 0,
  progress: 0,
  exercises: [],
};

export const DEFAULT_NUTRITION_ADVICE: NutritionAdvice = {
  proteinRecommendation: "暂无建议",
  proteinSources: [],
  hydrationTips: "保持充足饮水",
  mealSuggestions: [],
};
