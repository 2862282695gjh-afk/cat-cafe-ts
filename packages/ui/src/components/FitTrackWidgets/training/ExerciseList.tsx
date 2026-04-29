import { memo } from "react";
import type { Exercise } from "../types";
import { ExerciseItem } from "./ExerciseItem";

interface ExerciseListProps {
  exercises: Exercise[];
  onToggle: (id: string) => void;
}

export const ExerciseList = memo(function ExerciseList({ exercises, onToggle }: ExerciseListProps) {
  return (
    <div className="duo-exercise-list">
      {exercises.map((exercise) => (
        <ExerciseItem key={exercise.id} exercise={exercise} onToggle={onToggle} />
      ))}
    </div>
  );
});
