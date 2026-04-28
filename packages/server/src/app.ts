/**
 * Fastify 应用配置
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import { threadRoutes } from "./routes/threads.js";
import { agentRoutes } from "./routes/agents.js";
import { fittrackRoutes } from "./routes/fittrack.js";
import { JsonFileStore } from "./store/json-file.js";
import { FileMemoryStore } from "./store/file-memory.js";
import { FitTrackStore } from "./store/fittrack.js";
import { SessionManager } from "./session-manager.js";
import { MemoryExtractor } from "./memory-extractor.js";
import { ProjectDocStore } from "./store/project-doc-store.js";

export function createApp() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: "*" });

  const store = new JsonFileStore();
  threadRoutes(app, store);
  agentRoutes(app);

  // FitTrack 数据
  const fittrackStore = new FitTrackStore();
  fittrackStore.load();
  fittrackRoutes(app, fittrackStore);

  // 长期记忆 + 上下文管理
  const fileMemory = new FileMemoryStore();
  const sessionManager = new SessionManager(fileMemory);
  const memoryExtractor = new MemoryExtractor(fileMemory);

  // 项目文档
  const projectDocStore = new ProjectDocStore();

  return { app, store, sessionManager, memoryExtractor, fileMemory, projectDocStore };
}
