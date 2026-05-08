const WINDOW_MS = 10_000;
const MIN_ATTEMPTS = 3;

function isFailed(entry) {
  return !!(entry.error || (entry.status && entry.status >= 500));
}

export function detectRetryStorm(timeline, _swallowed) {
  const byKey = new Map();
  for (const entry of timeline) {
    if (!entry.url) continue;
    const key = `${entry.method ?? 'GET'}:${entry.url}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }

  for (const [key, entries] of byKey) {
    if (entries.length < MIN_ATTEMPTS) continue;
    const span = entries[entries.length - 1].ts - entries[0].ts;
    if (span > WINDOW_MS) continue;
    if (!entries.every(isFailed)) continue;

    return {
      pattern: 'retry_storm',
      confidence: 'likely',
      message: `Retry storm — ${entries.length} failing requests to ${key} in ${(span / 1000).toFixed(1)}s`,
      evidence: entries,
    };
  }

  return null;
}
