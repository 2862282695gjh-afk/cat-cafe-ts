/**
 * FitTrack API 路由
 *
 * 提供训练计划和饮食推荐的数据接口，与前端 props 接口对齐。
 *
 * 端点：
 *   GET  /api/fittrack/training                          — 获取当前训练计划（支持 ETag）
 *   PUT  /api/fittrack/training                          — 更新训练计划
 *   PATCH /api/fittrack/training/exercises/:id/complete   — 标记单个动作完成
 *   PATCH /api/fittrack/training/exercises/batch-complete — 批量标记动作完成
 *   GET  /api/fittrack/nutrition                         — 获取饮食推荐（支持 ETag）
 *   PUT  /api/fittrack/nutrition                         — 更新饮食推荐
 *   GET  /api/fittrack                                   — 获取全量数据（支持 ETag）
 */
import type { FastifyInstance } from "fastify";
import type { FitTrackStore, TrainingPlan, NutritionAdvice, Exercise } from "../store/fittrack.js";

const VALID_GOALS = new Set(["general", "muscle_gain", "fat_loss", "strength", "endurance"]);
const VALID_CATEGORIES = new Set(["strength", "cardio", "flexibility", "core"]);

// ==================== ETag 辅助 ====================

/** 如果请求 If-None-Match 与当前 ETag 匹配，返回 304 */
function conditionalGET(reply: any, etag: string): boolean {
  const ifNoneMatch = reply.request.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    reply.status(304).send();
    return true;
  }
  reply.header("ETag", etag);
  return false;
}

/** 重新计算训练计划进度 */
function recalcProgress(plan: TrainingPlan): void {
  const done = plan.exercises.filter((e) => e.completed).length;
  plan.progress = plan.exercises.length > 0 ? Math.round((done / plan.exercises.length) * 100) : 0;
}

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

const completeBodySchema = {
  type: "object",
  required: ["completed"],
  properties: { completed: { type: "boolean" } },
};

const batchCompleteBodySchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["exerciseId", "completed"],
        properties: {
          exerciseId: { type: "string" },
          completed: { type: "boolean" },
        },
      },
    },
  },
};

// ==================== 默认值 ====================

const DEFAULT_TRAINING = {
  id: "plan-default",
  name: "今日训练",
  goal: "general" as const,
  totalXP: 0,
  streak: 0,
  progress: 0,
  exercises: [] as Exercise[],
};

const DEFAULT_NUTRITION = {
  proteinRecommendation: "暂无建议",
  proteinSources: [] as string[],
  hydrationTips: "保持充足饮水",
  mealSuggestions: [] as any[],
};

// ==================== 路由 ====================

export function fittrackRoutes(fastify: FastifyInstance, store: FitTrackStore) {

  // ==================== 训练计划 ====================

  // GET /api/fittrack/training — 获取当前训练计划（支持 ETag）
  fastify.get("/api/fittrack/training", async (_req, reply) => {
    if (conditionalGET(reply, store.getETag())) return;

    const plan = store.getTrainingPlan();
    return {
      ...DEFAULT_TRAINING,
      ...plan,
      updatedAt: store.getUpdatedAt(),
    };
  });

  // PUT /api/fittrack/training — 更新训练计划（全量替换）
  fastify.put<{ Body: TrainingPlan }>("/api/fittrack/training", {
    schema: { body: trainingPlanSchema },
  }, async (req, reply) => {
    const plan = req.body;

    if (!VALID_GOALS.has(plan.goal)) {
      return reply.status(400).send({ error: `无效的 goal: ${plan.goal}` });
    }

    for (const ex of plan.exercises) {
      if (!VALID_CATEGORIES.has(ex.category)) {
        return reply.status(400).send({ error: `无效的 category: ${ex.category}` });
      }
    }

    recalcProgress(plan);
    store.setTrainingPlan(plan);
    reply.header("ETag", store.getETag());
    return { status: "updated", updatedAt: store.getUpdatedAt() };
  });

  // PATCH /api/fittrack/training/exercises/:exerciseId/complete — 标记单个动作完成/取消
  fastify.patch<{
    Params: { exerciseId: string };
    Body: { completed: boolean };
  }>("/api/fittrack/training/exercises/:exerciseId/complete", {
    schema: { body: completeBodySchema },
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
    recalcProgress(plan);
    store.setTrainingPlan(plan);

    reply.header("ETag", store.getETag());
    return {
      status: "updated",
      exercise: { id: exerciseId, completed: exercise.completed },
      progress: plan.progress,
      updatedAt: store.getUpdatedAt(),
    };
  });

  // PATCH /api/fittrack/training/exercises/batch-complete — 批量标记动作完成/取消
  fastify.patch<{
    Body: { items: Array<{ exerciseId: string; completed: boolean }> };
  }>("/api/fittrack/training/exercises/batch-complete", {
    schema: { body: batchCompleteBodySchema },
  }, async (req, reply) => {
    const { items } = req.body;

    const plan = store.getTrainingPlan();
    if (!plan) {
      return reply.status(404).send({ error: "暂无训练计划" });
    }

    const updated: Array<{ id: string; completed: boolean }> = [];
    for (const { exerciseId, completed } of items) {
      const exercise = plan.exercises.find((e) => e.id === exerciseId);
      if (!exercise) continue;
      exercise.completed = completed;
      updated.push({ id: exerciseId, completed });
    }

    recalcProgress(plan);
    store.setTrainingPlan(plan);

    reply.header("ETag", store.getETag());
    return {
      status: "updated",
      updated,
      progress: plan.progress,
      updatedAt: store.getUpdatedAt(),
    };
  });

  // ==================== 饮食推荐 ====================

  // GET /api/fittrack/nutrition — 获取饮食推荐（支持 ETag）
  fastify.get("/api/fittrack/nutrition", async (_req, reply) => {
    if (conditionalGET(reply, store.getETag())) return;

    const advice = store.getNutritionAdvice();
    return {
      ...DEFAULT_NUTRITION,
      ...advice,
      updatedAt: store.getUpdatedAt(),
    };
  });

  // PUT /api/fittrack/nutrition — 更新饮食推荐（全量替换）
  fastify.put<{ Body: NutritionAdvice }>("/api/fittrack/nutrition", {
    schema: { body: nutritionAdviceSchema },
  }, async (req, reply) => {
    const advice = req.body;
    store.setNutritionAdvice(advice);
    reply.header("ETag", store.getETag());
    return { status: "updated", updatedAt: store.getUpdatedAt() };
  });

  // ==================== 全量数据 ====================

  // GET /api/fittrack — 获取全量 FitTrack 数据（支持 ETag）
  fastify.get("/api/fittrack", async (_req, reply) => {
    if (conditionalGET(reply, store.getETag())) return;
    return store.getAll();
  });
}
