/**
 * FitTrack 数据存储接口
 *
 * 对应前端组件 props 的数据结构：
 *   - TrainingPlan → /api/fittrack/training
 *   - NutritionAdvice → /api/fittrack/nutrition
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

// ==================== 工具函数 ====================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function computeETag(data: unknown): string {
  const hash = crypto.createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 12);
  return `"${hash}"`;
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

// ==================== Store ====================

export class FitTrackStore {
  private data: FitTrackData = {
    trainingPlan: null,
    nutritionAdvice: null,
    updatedAt: 0,
  };
  private etag: string = "";

  /** 初始化：从磁盘加载 */
  load(): void {
    this.data = readJSON<FitTrackData>(FITTRACK_FILE, {
      trainingPlan: null,
      nutritionAdvice: null,
      updatedAt: 0,
    });
    this.rebuildETag();
  }

  /** 获取当前数据的 ETag */
  getETag(): string {
    return this.etag;
  }

  /** 获取最后更新时间 */
  getUpdatedAt(): number {
    return this.data.updatedAt;
  }

  private rebuildETag(): void {
    this.etag = computeETag(this.data);
  }

  private save(): void {
    this.data.updatedAt = Date.now();
    writeJSON(FITTRACK_FILE, this.data);
    this.rebuildETag();
  }

  // ===== Training Plan =====

  getTrainingPlan(): TrainingPlan | null {
    return this.data.trainingPlan ? deepClone(this.data.trainingPlan) : null;
  }

  setTrainingPlan(plan: TrainingPlan): void {
    this.data.trainingPlan = deepClone(plan);
    this.save();
  }

  // ===== Nutrition Advice =====

  getNutritionAdvice(): NutritionAdvice | null {
    return this.data.nutritionAdvice ? deepClone(this.data.nutritionAdvice) : null;
  }

  setNutritionAdvice(advice: NutritionAdvice): void {
    this.data.nutritionAdvice = deepClone(advice);
    this.save();
  }

  // ===== 全量数据 =====

  getAll(): FitTrackData {
    return deepClone(this.data);
  }
}
