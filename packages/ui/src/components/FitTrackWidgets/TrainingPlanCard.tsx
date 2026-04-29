import { useReducer, useCallback, useMemo, useRef, useState } from "react";
import type { TrainingPlan, Exercise } from "./types";
import { GOAL_LABELS } from "./types";
import { StreakBadge } from "./training/StreakBadge";
import { XPBadge } from "./training/XPBadge";
import { ProgressBar } from "./training/ProgressBar";
import { ExerciseList } from "./training/ExerciseList";
import { CompleteBanner } from "./training/CompleteBanner";

interface TrainingPlanCardProps {
  plan: TrainingPlan;
  onComplete?: (exerciseId: string, completed: boolean) => void;
  onStartWorkout?: () => void;
}

type Action =
  | { type: "INIT"; exercises: Exercise[] }
  | { type: "TOGGLE"; id: string }
  | { type: "SYNC"; exercises: Exercise[] };

function exerciseReducer(state: Exercise[], action: Action): Exercise[] {
  switch (action.type) {
    case "INIT":
      return action.exercises;
    case "TOGGLE":
      return state.map((e) =>
        e.id === action.id ? { ...e, completed: !e.completed } : e
      );
    case "SYNC":
      return action.exercises;
    default:
      return state;
  }
}

function usePrevious<T>(value: T): T | null {
  const ref = useRef<T | null>(null);
  const prev = ref.current;
  ref.current = value;
  return prev;
}

export function TrainingPlanCard({ plan, onComplete, onStartWorkout }: TrainingPlanCardProps) {
  const [exercises, dispatch] = useReducer(exerciseReducer, plan.exercises);
  const [started, setStarted] = useState(false);

  const prevExercises = usePrevious(plan.exercises);
  if (prevExercises !== null && prevExercises !== plan.exercises) {
    dispatch({ type: "SYNC", exercises: plan.exercises });
  }

  const completedCount = useMemo(
    () => exercises.filter((e) => e.completed).length,
    [exercises]
  );
  const totalCount = exercises.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = completedCount === totalCount && totalCount > 0;

  const handleToggle = useCallback(
    (id: string) => {
      const exercise = exercises.find((e) => e.id === id);
      if (exercise) {
        dispatch({ type: "TOGGLE", id });
        onComplete?.(id, !exercise.completed);
      }
    },
    [exercises, onComplete]
  );

  const handleStartWorkout = useCallback(() => {
    if (!started) {
      setStarted(true);
      onStartWorkout?.();
    }
  }, [started, onStartWorkout]);

  return (
    <div className="duo-card duo-training-card">
      <div className="duo-card-header">
        <div className="duo-header-left">
          <h3 className="duo-card-title">今日训练</h3>
          <span className="duo-goal-tag">{GOAL_LABELS[plan.goal]}</span>
        </div>
        <div className="duo-header-badges">
          <XPBadge xp={plan.totalXP} />
          <StreakBadge streak={plan.streak} />
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="duo-empty-state">
          <span className="duo-empty-icon" aria-hidden="true">📋</span>
          <p className="duo-empty-text">暂无训练计划</p>
          <p className="duo-empty-hint">完成一次训练后，数据将在此展示</p>
        </div>
      ) : (
        <>
          <div className="duo-progress-section">
            <div className="duo-progress-label">
              <span>{completedCount}/{totalCount} 已完成</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <ProgressBar value={progress} color={allDone ? "var(--duo-gold)" : undefined} />
          </div>

          <ExerciseList exercises={exercises} onToggle={handleToggle} />

          <div className="duo-card-footer">
            {allDone ? (
              <CompleteBanner xp={plan.totalXP} />
            ) : (
              <button
                className={`duo-btn ${started ? "duo-btn-active" : "duo-btn-primary"}`}
                onClick={handleStartWorkout}
              >
                {started ? "训练中..." : "开始训练"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
