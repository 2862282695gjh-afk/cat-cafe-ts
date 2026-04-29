import { memo, useState, useCallback } from "react";
import type { Exercise } from "../types";

interface ExerciseItemProps {
  exercise: Exercise;
  onToggle: (id: string) => void;
}

export const ExerciseItem = memo(function ExerciseItem({ exercise, onToggle }: ExerciseItemProps) {
  const [animating, setAnimating] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const [unchecking, setUnchecking] = useState(false);

  const handleClick = useCallback(() => {
    if (!exercise.completed) {
      setJustChecked(true);
      setAnimating(true);
    } else {
      setUnchecking(true);
    }
    onToggle(exercise.id);
  }, [exercise.id, exercise.completed, onToggle]);

  const handleAnimEnd = useCallback((_e: React.AnimationEvent) => {
    setAnimating(false);
  }, []);

  const handleCheckAnimEnd = useCallback(() => {
    setJustChecked(false);
  }, []);

  const handleUncheckAnimEnd = useCallback((_e: React.AnimationEvent) => {
    setUnchecking(false);
  }, []);

  const catClass = `duo-cat-${exercise.category}` as const;
  const itemClass = [
    "duo-exercise-item",
    animating ? "completing" : "",
    unchecking ? "unchecking" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={itemClass}>
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
        className={`duo-check-btn ${exercise.completed ? "checked" : ""} ${justChecked ? "pop draw-check" : ""} ${unchecking ? "shrink" : ""}`}
        onClick={handleClick}
        onAnimationEnd={(e) => {
          handleAnimEnd(e);
          handleUncheckAnimEnd(e);
        }}
        aria-label={exercise.completed ? "标记为未完成" : "标记为完成"}
        type="button"
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
