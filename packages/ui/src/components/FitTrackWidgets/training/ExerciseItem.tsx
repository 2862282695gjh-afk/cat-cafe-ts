import { memo, useState, useCallback } from "react";
import type { Exercise } from "../types";

interface ExerciseItemProps {
  exercise: Exercise;
  onToggle: (id: string) => void;
}

export const ExerciseItem = memo(function ExerciseItem({ exercise, onToggle }: ExerciseItemProps) {
  const [animating, setAnimating] = useState(false);
  const [justChecked, setJustChecked] = useState(false);

  const handleClick = useCallback(() => {
    if (!exercise.completed) {
      setJustChecked(true);
      setAnimating(true);
    }
    onToggle(exercise.id);
  }, [exercise.id, exercise.completed, onToggle]);

  const handleAnimationEnd = useCallback(() => {
    setAnimating(false);
  }, []);

  const handleCheckAnimEnd = useCallback(() => {
    setJustChecked(false);
  }, []);

  const catClass = `duo-cat-${exercise.category}` as const;

  return (
    <div className={`duo-exercise-item ${animating ? "completing" : ""}`}>
      <div className={`duo-exercise-icon ${catClass}`}>
        <span aria-hidden="true">{exercise.icon}</span>
      </div>
      <div className="duo-exercise-info">
        <span className={`duo-exercise-name ${exercise.completed ? "completed" : ""}`}>
          {exercise.name}
        </span>
        {exercise.completed && (
          <span
            className={`duo-exercise-strikethrough ${justChecked ? "animate" : ""}`}
            onAnimationEnd={handleCheckAnimEnd}
          />
        )}
        <span className="duo-exercise-meta">
          {exercise.sets}组 × {exercise.reps}次
          {exercise.weight ? ` · ${exercise.weight}kg` : ""}
          {exercise.duration ? ` · ${exercise.duration}min` : ""}
        </span>
      </div>
      <button
        className={`duo-check-btn ${exercise.completed ? "checked" : ""} ${justChecked ? "pop draw-check" : ""}`}
        onClick={handleClick}
        onAnimationEnd={handleAnimationEnd}
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
});
