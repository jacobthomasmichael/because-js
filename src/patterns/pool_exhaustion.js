const WINDOW_MS = 30_000;
const MIN_ERRORS = 2;
const CONNECTION_RE = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|connection refused|pool exhausted/i;

export function detectPoolExhaustion(timeline, _swallowed) {
  const errors = timeline.filter(e => e.error && CONNECTION_RE.test(e.error));
  if (errors.length < MIN_ERRORS) return null;

  const span = errors[errors.length - 1].ts - errors[0].ts;
  if (span > WINDOW_MS) return null;

  return {
    pattern: 'pool_exhaustion',
    confidence: 'likely',
    message: `Connection pool exhausted — ${errors.length} connection errors in ${(span / 1000).toFixed(1)}s`,
    evidence: errors,
  };
}
