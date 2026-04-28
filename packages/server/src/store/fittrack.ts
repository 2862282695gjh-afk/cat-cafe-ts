/**
 * FitTrack 数据存储接口
 *
 * 对应前端组件 props 的数据结构：
 *   - TrainingPlan → /api/fittrack/training
 *   - NutritionAdvice → /api/fittrack/nutrition
 */
import fs from "node:fs";
import path from "node:path";

// ==================== 类型定义（与前端 types.ts 对齐） ====================

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number;
  duration?: number;
  completed: boolean;
  icon: string;
  category: "strength" | "cardio" | "flexibility" | "core";
}

export interface TrainingPlan {
  id: string;
  name: string;
  goal: "general" | "muscle_gain" | "fat_loss" | "strength" | "endurance";
  exercises: Exercise[];
  totalXP: number;
  streak: number;
  progress: number;
}

export interface MealSuggestion {
  name: string;
  description: string;
  calories: number;
  protein: number;
}

export interface NutritionAdvice {
  proteinRecommendation: string;
  proteinSources: string[];
  hydrationTips: string;
  mealSuggestions: MealSuggestion[];
  supplementRecommendations?: string[];
}

export interface FitTrackData {
  trainingPlan: TrainingPlan | null;
  nutritionAdvice: NutritionAdvice | null;
  updatedAt: number;
}

// ==================== JSON 文件持久化 ====================

const DATA_DIR = path.resolve("data");
const FITTRACK_FILE = path.join(DATA_DIR, "fittrack.json");

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export class FitTrackStore {
  private data: FitTrackData = {
    trainingPlan: null,
    nutritionAdvice: null,
    updatedAt: 0,
  };

  /** 初始化：从磁盘加载 */
  load(): void {
    this.data = readJSON<FitTrackData>(FITTRACK_FILE, {
      trainingPlan: null,
      nutritionAdvice: null,
      updatedAt: 0,
    });
  }

  private save(): void {
    this.data.updatedAt = Date.now();
    writeJSON(FITTRACK_FILE, this.data);
  }

  // ===== Training Plan =====

  getTrainingPlan(): TrainingPlan | null {
    return this.data.trainingPlan;
  }

  setTrainingPlan(plan: TrainingPlan): void {
    this.data.trainingPlan = plan;
    this.save();
  }

  // ===== Nutrition Advice =====

  getNutritionAdvice(): NutritionAdvice | null {
    return this.data.nutritionAdvice;
  }

  setNutritionAdvice(advice: NutritionAdvice): void {
    this.data.nutritionAdvice = advice;
    this.save();
  }

  // ===== 全量数据 =====

  getAll(): FitTrackData {
    return this.data;
  }
}
