const WINDOW_MS = 60_000;

export function detectSilentFailure(_timeline, swallowed) {
  const recent = swallowed.filter(s => Date.now() - s.ts < WINDOW_MS);
  if (recent.length === 0) return null;

  return {
    pattern: 'silent_failure',
    confidence: 'likely',
    message: `${recent.length} caught-and-swallowed error(s) in the last 60s — likely silent upstream failure`,
    evidence: recent.map(s => ({ message: s.error?.message, ts: s.ts })),
  };
}
