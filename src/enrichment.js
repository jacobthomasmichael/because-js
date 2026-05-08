import { getTimeline, getSwallowed } from './buffer.js';
import { detectPoolExhaustion } from './patterns/pool_exhaustion.js';
import { detectSilentFailure } from './patterns/silent_failure.js';
import { detectRetryStorm } from './patterns/retry_storm.js';

const PATTERNS = [detectPoolExhaustion, detectSilentFailure, detectRetryStorm];

export function enrich(error) {
  if (!(error instanceof Error)) return error;
  const timeline = getTimeline();
  const swallowed = getSwallowed();
  error.__contextChain__ = {
    timeline,
    swallowed: swallowed.map(s => ({ message: s.error?.message, ts: s.ts })),
    patterns: PATTERNS.map(fn => fn(timeline, swallowed)).filter(Boolean),
  };
  return error;
}

export function formatContextChain(error) {
  const chain = error.__contextChain__;
  if (!chain || (chain.patterns.length === 0 && chain.swallowed.length === 0 && chain.timeline.length === 0)) {
    return '';
  }

  const lines = ['\n[Because Context]'];

  for (const p of chain.patterns) {
    lines.push(`  ${p.confidence === 'likely' ? 'Likely cause' : 'Possible cause'}: ${p.message}`);
  }

  if (chain.swallowed.length > 0) {
    lines.push(`  Caught-and-swallowed (${chain.swallowed.length}):`);
    for (const s of chain.swallowed) {
      lines.push(`    - ${s.message ?? 'unknown'} at ${new Date(s.ts).toISOString()}`);
    }
  }

  const recent = chain.timeline.slice(-10);
  if (recent.length > 0) {
    lines.push(`  Recent operations (last ${recent.length} of ${chain.timeline.length}):`);
    for (const op of recent) {
      const status = op.status != null ? ` → ${op.status}` : op.error ? ` → ERR: ${op.error}` : '';
      const dur = op.duration != null ? ` (${op.duration}ms)` : '';
      lines.push(`    [${op.type}] ${op.method ? op.method + ' ' : ''}${op.url ?? op.query ?? '?'}${status}${dur}`);
    }
  }

  return lines.join('\n');
}

export function installHooks() {
  process.on('uncaughtException', (error) => {
    enrich(error);
    const extra = formatContextChain(error);
    process.stderr.write((error.stack ?? String(error)) + extra + '\n');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    enrich(error);
    const extra = formatContextChain(error);
    process.stderr.write((error.stack ?? String(error)) + extra + '\n');
    process.exit(1);
  });
}
