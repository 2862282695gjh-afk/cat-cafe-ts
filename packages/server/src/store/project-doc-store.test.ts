/**
 * ProjectDocStore 单元测试
 *
 * 重点：appendLogEntry 并发竞态条件复现
 * 使用临时目录隔离文件操作。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectDocStore } from "./project-doc-store.js";

describe("ProjectDocStore", () => {
  let tmpDir: string;
  let store: ProjectDocStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cat-noodle-test-"));
    store = new ProjectDocStore(tmpDir);
    await store.init();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("appendLogEntry 并发安全", () => {
    it("多个 agent 并发写入不应丢失 log 条目", async () => {
      const threadId = "concurrent-test";
      const AGENT_COUNT = 10;
      const ENTRIES_PER_AGENT = 5;
      const totalExpected = AGENT_COUNT * ENTRIES_PER_AGENT;

      // 模拟 10 个 agent 各写 5 条 log，全部并发执行
      const promises: Promise<void>[] = [];
      for (let agent = 0; agent < AGENT_COUNT; agent++) {
        for (let i = 0; i < ENTRIES_PER_AGENT; i++) {
          promises.push(
            store.appendLogEntry(threadId, {
              timestamp: new Date().toISOString(),
              agentId: `agent-${agent}`,
              agentName: `Agent${agent}`,
              action: `操作 ${i + 1}`,
            }),
          );
        }
      }

      await Promise.all(promises);

      // 验证：读取 log 文件，统计条目数
      const logPath = path.join(tmpDir, `${threadId}-log.md`);
      const content = fs.readFileSync(logPath, "utf-8");
      const lineCount = content.split("\n").filter((l) => l.startsWith("- [")).length;

      // 期望：所有 50 条都保留
      // 实际：由于 readFile→writeFile 竞态，通常会有丢失
      expect(lineCount).toBe(totalExpected);
    });

    it("顺序写入应保留所有条目（基线）", async () => {
      const threadId = "sequential-test";
      const count = 10;

      for (let i = 0; i < count; i++) {
        await store.appendLogEntry(threadId, {
          timestamp: new Date().toISOString(),
          agentId: "test",
          agentName: "TestAgent",
          action: `顺序操作 ${i + 1}`,
        });
      }

      const logPath = path.join(tmpDir, `${threadId}-log.md`);
      const content = fs.readFileSync(logPath, "utf-8");
      const lineCount = content.split("\n").filter((l) => l.startsWith("- [")).length;

      expect(lineCount).toBe(count);
    });
  });

  describe("getRelevantContext", () => {
    it("初始化后应能获取基本上下文", async () => {
      const threadId = "context-test";
      await store.initDoc(threadId, "测试项目");

      const context = await store.getRelevantContext(threadId, "kohana");
      expect(context).toContain("测试项目");
    });
  });

  describe("mergeUpdate", () => {
    it("变更记录应追加而非覆盖", async () => {
      const threadId = "merge-test";
      await store.initDoc(threadId, "合并测试");

      // 第一次更新
      await store.mergeUpdate(threadId, "sasaki", `
## 变更记录
- 完成登录页面开发
`);

      // 第二次更新
      await store.mergeUpdate(threadId, "bunzo", `
## 变更记录
- 完成用户 API 开发
`);

      const doc = await store.getDoc(threadId);
      const changelogLines = doc.split("\n").filter((l) => l.startsWith("- "));
      expect(changelogLines).toHaveLength(2);
      expect(changelogLines[0]).toContain("登录页面开发");
      expect(changelogLines[1]).toContain("用户 API 开发");
    });
  });
});
