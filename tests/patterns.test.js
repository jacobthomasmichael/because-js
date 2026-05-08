import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPoolExhaustion } from '../src/patterns/pool_exhaustion.js';
import { detectSilentFailure } from '../src/patterns/silent_failure.js';
import { detectRetryStorm } from '../src/patterns/retry_storm.js';

const now = Date.now();

// --- pool_exhaustion ---

test('pool_exhaustion: fires on repeated connection errors within window', () => {
  const timeline = [
    { type: 'http', url: 'localhost:5432', error: 'ECONNREFUSED', ts: now - 5000 },
    { type: 'http', url: 'localhost:5432', error: 'ECONNREFUSED', ts: now - 3000 },
    { type: 'http', url: 'localhost:5432', error: 'connection refused', ts: now - 1000 },
  ];
  const result = detectPoolExhaustion(timeline, []);
  assert.ok(result, 'expected a match');
  assert.equal(result.pattern, 'pool_exhaustion');
  assert.equal(result.confidence, 'likely');
});

test('pool_exhaustion: returns null for a single error', () => {
  const timeline = [{ type: 'http', url: 'localhost:5432', error: 'ECONNREFUSED', ts: now }];
  assert.equal(detectPoolExhaustion(timeline, []), null);
});

test('pool_exhaustion: returns null when errors are spread beyond 30s', () => {
  const timeline = [
    { type: 'http', url: 'localhost:5432', error: 'ECONNREFUSED', ts: now - 31_000 },
    { type: 'http', url: 'localhost:5432', error: 'ECONNREFUSED', ts: now },
  ];
  assert.equal(detectPoolExhaustion(timeline, []), null);
});

test('pool_exhaustion: returns null when errors are not connection-related', () => {
  const timeline = [
    { type: 'http', url: 'localhost:5432', error: 'SyntaxError', ts: now - 1000 },
    { type: 'http', url: 'localhost:5432', error: 'TypeError', ts: now },
  ];
  assert.equal(detectPoolExhaustion(timeline, []), null);
});

// --- silent_failure ---

test('silent_failure: fires when recent swallowed errors exist', () => {
  const swallowed = [
    { error: new Error('auth service 503'), ts: now - 5000 },
    { error: new Error('cache miss cascade'), ts: now - 2000 },
  ];
  const result = detectSilentFailure([], swallowed);
  assert.ok(result);
  assert.equal(result.pattern, 'silent_failure');
  assert.equal(result.evidence.length, 2);
});

test('silent_failure: returns null when no swallowed errors', () => {
  assert.equal(detectSilentFailure([], []), null);
});

test('silent_failure: returns null when swallowed errors are older than 60s', () => {
  const swallowed = [{ error: new Error('old'), ts: now - 90_000 }];
  assert.equal(detectSilentFailure([], swallowed), null);
});

// --- retry_storm ---

test('retry_storm: fires on rapid repeated failures to same endpoint', () => {
  const timeline = [
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 503, ts: now - 4000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 503, ts: now - 3000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 503, ts: now - 2000 },
  ];
  const result = detectRetryStorm(timeline, []);
  assert.ok(result);
  assert.equal(result.pattern, 'retry_storm');
});

test('retry_storm: returns null when requests succeed', () => {
  const timeline = [
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 200, ts: now - 2000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 200, ts: now - 1000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 200, ts: now },
  ];
  assert.equal(detectRetryStorm(timeline, []), null);
});

test('retry_storm: returns null when failures span more than 10s', () => {
  const timeline = [
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 503, ts: now - 12_000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 503, ts: now - 6000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', status: 503, ts: now },
  ];
  assert.equal(detectRetryStorm(timeline, []), null);
});

test('retry_storm: returns null when fewer than 3 attempts', () => {
  const timeline = [
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', error: 'ECONNREFUSED', ts: now - 1000 },
    { type: 'fetch', method: 'GET', url: 'https://api.example.com/data', error: 'ECONNREFUSED', ts: now },
  ];
  assert.equal(detectRetryStorm(timeline, []), null);
});
