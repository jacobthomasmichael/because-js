# because-js

**Your app already knows why it crashed. Now it can tell you.**

Every error tracker shows you *where* software broke. Almost none tell you *why*.

When a production incident fires, the stack trace points at the crash site. Then the real work starts — digging through logs, correlating metrics, walking backwards through recent deploys to reconstruct what actually caused it. That investigation is where engineering hours disappear.

`because` is an open-source Node.js library that closes that gap. It runs silently inside your application, keeping a rolling record of recent operations — HTTP calls, database queries, cache lookups — in a lightweight in-memory buffer. When an exception is thrown, it grabs that record, matches it against known failure patterns, and attaches a plain-English causal chain directly to the error. Before it ever hits your logs.

One of `because`'s most valuable features surfaces something error trackers almost never show: exceptions that were *caught and quietly discarded* upstream. These silent failures are one of the most common causes of confusing incidents — an error gets swallowed somewhere, `null` propagates invisibly, and something crashes three function calls later at a site that looks completely unrelated. `because` makes that chain visible.

Drop-in setup, no lock-in. One line gets you started. Context attaches to the exception object itself, so it flows naturally into Sentry, Datadog, structured logs, or OpenTelemetry — wherever your errors already go.

Also available for Python: [`because-py`](https://pypi.org/project/because-py/)

---

## Before and after

**Before `because`:**
```
Error: API returned 503
    at callApi (app/services/payment.js:21:16)
    at processOrder (app/api/checkout.js:54:3)
```
You have a 503. You don't know why.

**After `because`:**
```
Error: API returned 503
    at callApi (app/services/payment.js:21:16)
    at processOrder (app/api/checkout.js:54:3)

[Because Context]
  Likely cause: Retry storm — 4 failing requests to GET:https://payment.internal/charge in 0.6s
  Recent operations (last 4 of 4):
    [http] GET https://payment.internal/charge → 503 (12ms)
    [http] GET https://payment.internal/charge → 503 (8ms)
    [http] GET https://payment.internal/charge → 503 (9ms)
    [http] GET https://payment.internal/charge → 503 (11ms)
```
You see the pattern. A naive retry loop hammering a degraded upstream. You know exactly where to look.

---

## Install

```bash
npm install @jacobthomasmichael/because-js
```

Requires Node.js 18+.

---

## Zero-config setup

```js
import { install } from '@jacobthomasmichael/because-js';

install();
```

That's it. `because` patches `globalThis.fetch` and `node:http`/`node:https`, installs `process.on('uncaughtException')` and `process.on('unhandledRejection')` hooks, and starts recording operations in a per-async-context ring buffer. Any uncaught error automatically gets an enriched context chain appended to stderr.

---

## Async context: `run()`

`because` uses `AsyncLocalStorage` to isolate ring buffers per async context — concurrent requests don't bleed into each other. Wrap your request handler (or any logical unit of work) in `run()`:

```js
import { run } from '@jacobthomasmichael/because-js';

// Express
app.use((req, res, next) => {
  run(() => next());
});

// Manual
await run(async () => {
  await processOrder(orderId);
});
```

Operations recorded inside a `run()` are invisible to all other concurrent `run()` contexts.

---

## Recording swallowed exceptions

Silently caught errors are often the real cause of a downstream crash. Use `recordSwallowed()` to make them visible to `because`:

```js
import { recordSwallowed } from '@jacobthomasmichael/because-js';

async function getUser(userId) {
  try {
    return await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  } catch (err) {
    recordSwallowed(err);  // because will surface this if something crashes downstream
    return null;
  }
}
```

When a downstream `TypeError: Cannot read properties of null` fires, `because` surfaces the swallowed DB error as the likely cause — not the symptom.

---

## Enriching caught exceptions manually

`install()` handles uncaught errors automatically. For caught exceptions you want to enrich and forward:

```js
import { enrich, formatContextChain } from '@jacobthomasmichael/because-js';

try {
  await processOrder(orderId);
} catch (err) {
  enrich(err);
  logger.error(err.stack + formatContextChain(err));

  // err.__contextChain__ serializes cleanly into Sentry extra,
  // Datadog span tags, or structured log fields
  Sentry.captureException(err, { extra: err.__contextChain__ });
  throw err;
}
```

---

## Instruments

`because` patches the standard HTTP interfaces automatically when you call `install()`. You can opt out of either:

```js
install({ fetch: false });  // skip fetch patching
install({ http: false });   // skip node:http / node:https patching
install({ fetch: false, http: false });  // hooks only, no patching
```

Both instruments record method, URL, status code, duration, and any error message into the ring buffer on every request — **zero I/O on the hot path**.

### What gets recorded

```js
// fetch
{ type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 200, duration: 42 }
{ type: 'fetch', method: 'POST', url: 'https://api.example.com/checkout', status: null, error: 'ECONNREFUSED' }

// node:http / node:https
{ type: 'http', method: 'GET', url: 'https://payment.internal/charge', status: 503, duration: 11 }
```

---

## Heuristic patterns

Pattern matching runs at throw time — no API key, no network call, no added latency:

| Pattern | Fires when |
|---|---|
| `pool_exhaustion` | ≥ 2 connection errors (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`) within 30s |
| `silent_failure` | ≥ 1 swallowed exception (via `recordSwallowed`) within the last 60s |
| `retry_storm` | ≥ 3 failing requests to the same endpoint within 10s |

Each pattern is a small, independently testable function. Output always uses hedged language — `because` never claims certainty.

---

## Low-level API

```js
import { run, record, recordSwallowed, getTimeline, getSwallowed, enrich, formatContextChain } from '@jacobthomasmichael/because-js';

// Wrap a unit of async work in an isolated context
await run(async () => { ... });

// Record an arbitrary operation (useful for custom instruments)
record({ type: 'db', method: 'SELECT', url: 'postgres://...', status: null, error: 'timeout', duration: 30050 });

// Mark a swallowed exception as causal context
recordSwallowed(err);

// Read the current context's ring buffer (returns [] outside of run())
const timeline = getTimeline();
const swallowed = getSwallowed();

// Attach __contextChain__ to an Error and return it
enrich(err);

// Format __contextChain__ as a human-readable string (returns '' if empty)
formatContextChain(err);
```

---

## Runnable examples

```bash
node examples/silent_failure.js   # swallowed auth error → null dereference downstream
node examples/retry_storm.js      # naive retry loop hammers a local 503 server
node examples/pool_exhaustion.js  # repeated ECONNREFUSED simulates pool saturation
```

Each example is self-contained and produces enriched output on stderr.

---

## Design principles

- **Honest framing.** Output uses "Likely cause" and "Possible cause." Wrong-but-confident destroys trust faster than no answer.
- **Zero-config default.** `install()` does something useful immediately.
- **No hot-path cost.** Instrumentation writes to a bounded ring buffer (capacity 100). Enrichment runs only on exception.
- **Composable.** `__contextChain__` is a plain object — attach it to Sentry `extra`, Datadog span tags, or structured log fields. `because` doesn't replace your existing observability stack.
- **Library, not platform.** No required backend, no telemetry. Ships as an npm package.

---

## Roadmap

- Framework middleware (Express, Fastify, Hapi)
- `axios` and `got` instruments
- LLM-based root cause explanation (optional, BYO API key)
- OpenTelemetry span export
- Python port: [because-py](https://github.com/jacobthomasmichael/because)
