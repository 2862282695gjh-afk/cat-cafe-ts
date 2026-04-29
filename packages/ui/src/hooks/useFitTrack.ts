import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api/client";
import type { TrainingPlan, NutritionAdvice } from "../components/FitTrackWidgets/types";

interface UseFitTrackReturn {
  trainingPlan: TrainingPlan | null;
  nutritionAdvice: NutritionAdvice | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  completeExercise: (exerciseId: string, completed: boolean) => Promise<void>;
  batchCompleteExercises: (items: Array<{ exerciseId: string; completed: boolean }>) => Promise<void>;
}

export function useFitTrack(): UseFitTrackReturn {
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
  const [nutritionAdvice, setNutritionAdvice] = useState<NutritionAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const etagRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (etagRef.current) {
        headers["If-None-Match"] = etagRef.current;
      }

      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? ""}/api/fittrack`,
        { headers },
      );

      // 304 未修改 — 直接使用缓存数据
      if (res.status === 304) {
        return;
      }

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      // 存储 ETag
      const newETag = res.headers.get("ETag");
      if (newETag) etagRef.current = newETag;

      const data = await res.json();
      setTrainingPlan(data.trainingPlan);
      setNutritionAdvice(data.nutritionAdvice);
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
        const result = await api.completeExercise(exerciseId, completed);
        // 增量更新：只修改本地状态中对应的 exercise
        setTrainingPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            progress: result.progress,
            exercises: prev.exercises.map((e) =>
              e.id === exerciseId ? { ...e, completed: result.exercise.completed } : e,
            ),
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    },
    [],
  );

  const batchCompleteExercises = useCallback(
    async (items: Array<{ exerciseId: string; completed: boolean }>) => {
      try {
        const result = await api.batchCompleteExercises(items);
        setTrainingPlan((prev) => {
          if (!prev) return prev;
          const updatedMap = new Map(result.updated.map((u) => [u.id, u.completed]));
          return {
            ...prev,
            progress: result.progress,
            exercises: prev.exercises.map((e) => {
              const newCompleted = updatedMap.get(e.id);
              return newCompleted !== undefined ? { ...e, completed: newCompleted } : e;
            }),
          };
        });
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
    batchCompleteExercises,
  };
}
