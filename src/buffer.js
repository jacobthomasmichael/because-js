import { AsyncLocalStorage } from 'node:async_hooks';

const BUFFER_SIZE = 100;
const storage = new AsyncLocalStorage();

class RingBuffer {
  #buf;
  #head = 0;
  #size = 0;
  #capacity;

  constructor(capacity = BUFFER_SIZE) {
    this.#capacity = capacity;
    this.#buf = new Array(capacity);
  }

  push(entry) {
    this.#buf[this.#head] = entry;
    this.#head = (this.#head + 1) % this.#capacity;
    if (this.#size < this.#capacity) this.#size++;
  }

  toArray() {
    if (this.#size === 0) return [];
    const start = this.#size < this.#capacity ? 0 : this.#head;
    const result = new Array(this.#size);
    for (let i = 0; i < this.#size; i++) {
      result[i] = this.#buf[(start + i) % this.#capacity];
    }
    return result;
  }

  get size() { return this.#size; }
}

export function run(fn) {
  const ctx = { buffer: new RingBuffer(), swallowed: [] };
  return storage.run(ctx, fn);
}

export function record(entry) {
  const ctx = storage.getStore();
  if (ctx) ctx.buffer.push({ ...entry, ts: Date.now() });
}

export function recordSwallowed(error) {
  const ctx = storage.getStore();
  if (ctx) ctx.swallowed.push({ error, ts: Date.now() });
}

export function getTimeline() {
  const ctx = storage.getStore();
  return ctx ? ctx.buffer.toArray() : [];
}

export function getSwallowed() {
  const ctx = storage.getStore();
  return ctx ? ctx.swallowed : [];
}
