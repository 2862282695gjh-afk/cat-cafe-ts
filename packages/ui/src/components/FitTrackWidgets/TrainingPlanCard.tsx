import { useState, useCallback, useEffect } from "react";
import type { TrainingPlan, Exercise } from "./types";
import { GOAL_LABELS, CATEGORY_COLORS, CATEGORY_BG_COLORS } from "./types";

interface TrainingPlanCardProps {
  plan: TrainingPlan;
  onComplete?: (exerciseId: string, completed: boolean) => void;
  onStartWorkout?: () => void;
}

function StreakBadge({ streak }: { streak: number }) {
  return (
    <div className="duo-streak-badge">
      <span className="duo-streak-flame" role="img" aria-label="streak">
        🔥
      </span>
      <span className="duo-streak-count">{streak}</span>
      <span className="duo-streak-label">天连胜</span>
    </div>
  );
}

function XPBadge({ xp }: { xp: number }) {
  return (
    <div className="duo-xp-badge">
      <span className="duo-xp-icon">⚡</span>
      <span className="duo-xp-count">{xp}</span>
      <span className="duo-xp-label">XP</span>
    </div>
  );
}

function ProgressBar({ value, color = "#58CC02" }: { value: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="duo-progress-track">
      <div
        className="duo-progress-fill"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ExerciseItem({
  exercise,
  onToggle,
  index,
}: {
  exercise: Exercise;
  onToggle: (id: string) => void;
  index: number;
}) {
  const bgColor = CATEGORY_BG_COLORS[exercise.category];
  const textColor = CATEGORY_COLORS[exercise.category];

  return (
    <div className="duo-exercise-item" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="duo-exercise-icon" style={{ backgroundColor: bgColor, color: textColor }}>
        <span>{exercise.icon}</span>
      </div>
      <div className="duo-exercise-info">
        <span className={`duo-exercise-name ${exercise.completed ? "completed" : ""}`}>
          {exercise.name}
        </span>
        <span className="duo-exercise-meta">
          {exercise.sets}组 × {exercise.reps}次
          {exercise.weight ? ` · ${exercise.weight}kg` : ""}
          {exercise.duration ? ` · ${exercise.duration}min` : ""}
        </span>
      </div>
      <button
        className={`duo-check-btn ${exercise.completed ? "checked" : ""}`}
        onClick={() => onToggle(exercise.id)}
        aria-label={exercise.completed ? "标记为未完成" : "标记为完成"}
      >
        {exercise.completed ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </button>
    </div>
  );
}

export function TrainingPlanCard({ plan, onComplete, onStartWorkout }: TrainingPlanCardProps) {
  const [exercises, setExercises] = useState(plan.exercises);

  useEffect(() => {
    setExercises(plan.exercises);
  }, [plan.exercises]);

  const completedCount = exercises.filter((e) => e.completed).length;
  const totalCount = exercises.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleToggle = useCallback(
    (id: string) => {
      setExercises((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const next = !e.completed;
          onComplete?.(id, next);
          return { ...e, completed: next };
        })
      );
    },
    [onComplete]
  );

  const allDone = completedCount === totalCount && totalCount > 0;

  return (
    <div className="duo-card duo-training-card">
      {/* 卡片头部 — 连胜 & XP */}
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

      {/* 空状态 */}
      {totalCount === 0 ? (
        <div className="duo-empty-state">
          <span className="duo-empty-icon">📋</span>
          <p className="duo-empty-text">暂无训练计划</p>
          <p className="duo-empty-hint">完成一次训练后，数据将在此展示</p>
        </div>
      ) : (
        <>
          {/* 进度条 */}
          <div className="duo-progress-section">
            <div className="duo-progress-label">
              <span>{completedCount}/{totalCount} 已完成</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <ProgressBar value={progress} color={allDone ? "#FFC800" : "#58CC02"} />
          </div>

          {/* 训练项目列表 */}
          <div className="duo-exercise-list">
            {exercises.map((exercise, i) => (
              <ExerciseItem key={exercise.id} exercise={exercise} onToggle={handleToggle} index={i} />
            ))}
          </div>

          {/* 底部按钮 */}
          <div className="duo-card-footer">
            {allDone ? (
              <div className="duo-complete-banner">
                <span>🎉</span>
                <span>太棒了！今日训练全部完成！</span>
                <span>+{plan.totalXP} XP</span>
              </div>
            ) : (
              <button className="duo-btn duo-btn-primary" onClick={onStartWorkout}>
                开始训练
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
