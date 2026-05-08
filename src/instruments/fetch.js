import { record } from '../buffer.js';

export function instrumentFetch() {
  const orig = globalThis.fetch;
  if (!orig) return; // not available (Node < 18.0)

  globalThis.fetch = async function becauseFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const start = Date.now();
    try {
      const res = await orig.call(this, input, init);
      record({ type: 'fetch', method, url, status: res.status, duration: Date.now() - start });
      return res;
    } catch (err) {
      record({ type: 'fetch', method, url, status: null, duration: Date.now() - start, error: err.message });
      throw err;
    }
  };
}
