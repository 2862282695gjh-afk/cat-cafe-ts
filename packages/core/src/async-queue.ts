/**
 * 多生产者 / 单消费者异步队列
 *
 * 用于合并多个 AsyncGenerator 的事件流。
 * 生产者通过 push() 写入，消费者通过 Symbol.asyncIterator 读取。
 * close() 后迭代器结束。
 */
export class AsyncQueue<T> {
  private _queue: T[] = [];
  private _resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private _closed = false;

  push(value: T): void {
    if (this._closed) return;
    const resolver = this._resolvers.shift();
    if (resolver) {
      resolver({ value, done: false });
    } else {
      this._queue.push(value);
    }
  }

  /** 传入 Error 会被 consumer 当作异常抛出 */
  error(err: unknown): void {
    const resolver = this._resolvers.shift();
    if (resolver) {
      resolver({ value: err as T, done: false });
    }
  }

  close(): void {
    this._closed = true;
    for (const resolver of this._resolvers) {
      resolver({ value: undefined as T, done: true });
    }
    this._resolvers = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const value = this._queue.shift();
        if (value !== undefined) {
          return Promise.resolve({ value, done: false });
        }
        if (this._closed) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this._resolvers.push(resolve);
        });
      },
    };
  }
}
