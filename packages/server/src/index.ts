/**
 * @cat-cafe/server — 启动入口
 *
 * npx tsx packages/server/src/index.ts
 */
import { createApp } from "./app.js";
import { setupWebSocket } from "./ws/handler.js";
import { cleanup } from "./pool.js";
import { loadSessions } from "./store/session-store.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

async function main() {
  const { app, store, sessionManager, memoryExtractor, fileMemory, projectDocStore } = createApp();

  // 初始化存储（从磁盘加载线程和消息）
  await store.init();
  await fileMemory.init();
  await projectDocStore.init();
  loadSessions();

  // 等 Fastify 准备好
  await app.ready();

  // Fastify 5 内部管理 http.Server，通过 app.server 访问
  const io = (await import("socket.io")).Server;
  const socketServer = new io(app.server, {
    cors: { origin: "*" },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  setupWebSocket(socketServer, store, sessionManager, memoryExtractor, projectDocStore);

  app.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error("[Server] 启动失败:", err);
      process.exit(1);
    }
    console.log(`[Server] Cat Cafe 运行在 ${address}`);
  });

  // 进程退出时清理所有 CLI 子进程
  for (const signal of ["SIGINT", "SIGTERM", "exit"] as const) {
    process.on(signal, () => {
      cleanup();
      if (signal !== "exit") process.exit(0);
    });
  }
}

main();
