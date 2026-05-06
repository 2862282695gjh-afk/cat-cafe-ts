/**
 * AsyncQueue 单元测试
 */
import { describe, it, expect } from "vitest";
import { AsyncQueue } from "./async-queue.js";

describe("AsyncQueue", () => {
  it("应该按 push 顺序消费元素", async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);

    const items: number[] = [];
    for await (const item of queue) {
      items.push(item);
      if (items.length === 3) break;
    }
    expect(items).toEqual([1, 2, 3]);
  });

  it("应该在 close 后停止迭代", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.push("b");
    queue.close();

    const items: string[] = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).toEqual(["a", "b"]);
  });

  it("应该在 close 后拒绝新的 push", () => {
    const queue = newQueueWithClose();
    // close 后 push 不报错但被忽略
    queue.q.push("ignored");
    // 已关闭的队列不会再产出元素
  });

  function newQueueWithClose() {
    const q = new AsyncQueue<string>();
    q.push("before");
    q.close();
    return { q };
  }

  it("应该支持异步 push（先启动消费者，后 push）", async () => {
    const queue = new AsyncQueue<number>();

    // 并行：一个消费者等待 + 一个延迟生产者
    const consumer = (async () => {
      const items: number[] = [];
      for await (const item of queue) {
        items.push(item);
      }
      return items;
    })();

    // 延迟 push
    setTimeout(() => {
      queue.push(42);
      queue.push(43);
      queue.close();
    }, 10);

    const items = await consumer;
    expect(items).toEqual([42, 43]);
  });

  it("空队列 close 后应立即结束迭代", async () => {
    const queue = new AsyncQueue<number>();
    queue.close();

    const items: number[] = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).toEqual([]);
  });

  it("应该在多次 close 时安全处理", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.close();
    queue.close(); // 二次 close 不应报错

    const items: string[] = [];
    for await (const item of queue) {
      items.push(item);
    }
    expect(items).toEqual(["a"]);
  });
});
