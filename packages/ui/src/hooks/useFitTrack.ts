import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { TrainingPlan, NutritionAdvice } from "../components/FitTrackWidgets/types";

interface UseFitTrackReturn {
  trainingPlan: TrainingPlan | null;
  nutritionAdvice: NutritionAdvice | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  completeExercise: (exerciseId: string, completed: boolean) => Promise<void>;
}

const DEFAULT_TRAINING: TrainingPlan = {
  id: "plan-default",
  name: "今日训练",
  goal: "general",
  totalXP: 0,
  streak: 0,
  progress: 0,
  exercises: [],
};

const DEFAULT_NUTRITION: NutritionAdvice = {
  proteinRecommendation: "暂无建议",
  proteinSources: [],
  hydrationTips: "保持充足饮水",
  mealSuggestions: [],
};

export function useFitTrack(): UseFitTrackReturn {
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
  const [nutritionAdvice, setNutritionAdvice] = useState<NutritionAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFitTrack();
      setTrainingPlan(data.trainingPlan ?? DEFAULT_TRAINING);
      setNutritionAdvice(data.nutritionAdvice ?? DEFAULT_NUTRITION);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const completeExercise = useCallback(
    async (exerciseId: string, completed: boolean) => {
      try {
        const { plan } = await api.completeExercise(exerciseId, completed);
        setTrainingPlan(plan);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    },
    [],
  );

  return {
    trainingPlan,
    nutritionAdvice,
    loading,
    error,
    refresh: fetchData,
    completeExercise,
  };
}
