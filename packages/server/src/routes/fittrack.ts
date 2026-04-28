/**
 * FitTrack API 路由
 *
 * 提供训练计划和饮食推荐的数据接口，与前端 props 接口对齐。
 *
 * 端点：
 *   GET  /api/fittrack/training     — 获取当前训练计划
 *   PUT  /api/fittrack/training     — 更新训练计划
 *   PATCH /api/fittrack/training/exercises/:exerciseId/complete — 标记动作完成
 *   GET  /api/fittrack/nutrition    — 获取饮食推荐
 *   PUT  /api/fittrack/nutrition    — 更新饮食推荐
 *   GET  /api/fittrack              — 获取全量数据
 */
import type { FastifyInstance } from "fastify";
import type { FitTrackStore, TrainingPlan, NutritionAdvice } from "../store/fittrack.js";

const VALID_GOALS = new Set(["general", "muscle_gain", "fat_loss", "strength", "endurance"]);
const VALID_CATEGORIES = new Set(["strength", "cardio", "flexibility", "core"]);

// ==================== Schema 定义（Fastify 校验） ====================

const exerciseSchema = {
  type: "object",
  required: ["id", "name", "sets", "reps", "completed", "icon", "category"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    sets: { type: "integer", minimum: 0 },
    reps: { type: "integer", minimum: 0 },
    weight: { type: "number", minimum: 0 },
    duration: { type: "integer", minimum: 0 },
    completed: { type: "boolean" },
    icon: { type: "string" },
    category: { type: "string", enum: ["strength", "cardio", "flexibility", "core"] },
  },
};

const trainingPlanSchema = {
  type: "object",
  required: ["id", "name", "goal", "exercises"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    goal: { type: "string", enum: ["general", "muscle_gain", "fat_loss", "strength", "endurance"] },
    exercises: { type: "array", items: exerciseSchema },
    totalXP: { type: "integer", minimum: 0 },
    streak: { type: "integer", minimum: 0 },
    progress: { type: "integer", minimum: 0, maximum: 100 },
  },
};

const mealSuggestionSchema = {
  type: "object",
  required: ["name", "description", "calories", "protein"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    calories: { type: "number", minimum: 0 },
    protein: { type: "number", minimum: 0 },
  },
};

const nutritionAdviceSchema = {
  type: "object",
  required: ["proteinRecommendation", "proteinSources", "hydrationTips", "mealSuggestions"],
  properties: {
    proteinRecommendation: { type: "string" },
    proteinSources: { type: "array", items: { type: "string" } },
    hydrationTips: { type: "string" },
    mealSuggestions: { type: "array", items: mealSuggestionSchema },
    supplementRecommendations: { type: "array", items: { type: "string" } },
  },
};

export function fittrackRoutes(fastify: FastifyInstance, store: FitTrackStore) {

  // ==================== 训练计划 ====================

  // GET /api/fittrack/training — 获取当前训练计划
  fastify.get("/api/fittrack/training", async () => {
    const plan = store.getTrainingPlan();
    if (!plan) {
      return {
        id: "plan-default",
        name: "今日训练",
        goal: "general" as const,
        totalXP: 0,
        streak: 0,
        progress: 0,
        exercises: [],
      };
    }
    return plan;
  });

  // PUT /api/fittrack/training — 更新训练计划（全量替换）
  fastify.put<{ Body: TrainingPlan }>("/api/fittrack/training", {
    schema: { body: trainingPlanSchema },
  }, async (req, reply) => {
    const plan = req.body;

    // 校验 goal
    if (!VALID_GOALS.has(plan.goal)) {
      return reply.status(400).send({ error: `无效的 goal: ${plan.goal}` });
    }

    // 校验 exercises
    for (const ex of plan.exercises) {
      if (!VALID_CATEGORIES.has(ex.category)) {
        return reply.status(400).send({ error: `无效的 category: ${ex.category}` });
      }
    }

    store.setTrainingPlan(plan);
    return { status: "updated", plan };
  });

  // PATCH /api/fittrack/training/exercises/:exerciseId/complete — 标记动作完成/取消
  fastify.patch<{
    Params: { exerciseId: string };
    Body: { completed: boolean };
  }>("/api/fittrack/training/exercises/:exerciseId/complete", {
    schema: {
      body: {
        type: "object",
        required: ["completed"],
        properties: { completed: { type: "boolean" } },
      },
    },
  }, async (req, reply) => {
    const { exerciseId } = req.params;
    const { completed } = req.body;

    const plan = store.getTrainingPlan();
    if (!plan) {
      return reply.status(404).send({ error: "暂无训练计划" });
    }

    const exercise = plan.exercises.find((e) => e.id === exerciseId);
    if (!exercise) {
      return reply.status(404).send({ error: `动作不存在: ${exerciseId}` });
    }

    exercise.completed = completed;

    // 重新计算进度
    const done = plan.exercises.filter((e) => e.completed).length;
    plan.progress = plan.exercises.length > 0 ? Math.round((done / plan.exercises.length) * 100) : 0;

    store.setTrainingPlan(plan);
    return { status: "updated", plan };
  });

  // ==================== 饮食推荐 ====================

  // GET /api/fittrack/nutrition — 获取饮食推荐
  fastify.get("/api/fittrack/nutrition", async () => {
    const advice = store.getNutritionAdvice();
    if (!advice) {
      return {
        proteinRecommendation: "暂无建议",
        proteinSources: [],
        hydrationTips: "保持充足饮水",
        mealSuggestions: [],
      };
    }
    return advice;
  });

  // PUT /api/fittrack/nutrition — 更新饮食推荐（全量替换）
  fastify.put<{ Body: NutritionAdvice }>("/api/fittrack/nutrition", {
    schema: { body: nutritionAdviceSchema },
  }, async (req) => {
    const advice = req.body;
    store.setNutritionAdvice(advice);
    return { status: "updated", advice };
  });

  // ==================== 全量数据 ====================

  // GET /api/fittrack — 获取全量 FitTrack 数据
  fastify.get("/api/fittrack", async () => {
    return store.getAll();
  });
}
