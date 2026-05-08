import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, record, recordSwallowed, getTimeline, getSwallowed } from '../src/buffer.js';

test('captures entries within a context', async () => {
  await run(async () => {
    record({ type: 'fetch', method: 'GET', url: 'https://a.com', status: 200, duration: 10 });
    record({ type: 'fetch', method: 'POST', url: 'https://b.com', status: 500, duration: 50 });
    const timeline = getTimeline();
    assert.equal(timeline.length, 2);
    assert.equal(timeline[0].url, 'https://a.com');
    assert.equal(timeline[1].status, 500);
  });
});

test('contexts are isolated across concurrent runs', async () => {
  await Promise.all([
    run(async () => {
      record({ type: 'fetch', url: 'https://a.com' });
      await new Promise(r => setTimeout(r, 20));
      assert.equal(getTimeline().length, 1);
      assert.equal(getTimeline()[0].url, 'https://a.com');
    }),
    run(async () => {
      record({ type: 'fetch', url: 'https://b.com' });
      await new Promise(r => setTimeout(r, 20));
      assert.equal(getTimeline().length, 1);
      assert.equal(getTimeline()[0].url, 'https://b.com');
    }),
  ]);
});

test('ring buffer evicts oldest entries at capacity', async () => {
  await run(async () => {
    for (let i = 0; i < 150; i++) {
      record({ type: 'fetch', url: `https://example.com/${i}` });
    }
    const timeline = getTimeline();
    assert.equal(timeline.length, 100);
    // oldest retained is entry 50, newest is 149
    assert.equal(timeline[0].url, 'https://example.com/50');
    assert.equal(timeline[99].url, 'https://example.com/149');
  });
});

test('no entries outside a run context', () => {
  assert.deepEqual(getTimeline(), []);
  record({ type: 'fetch', url: 'https://noop.com' }); // should not throw
  assert.deepEqual(getTimeline(), []);
});

test('recordSwallowed captures errors in context', async () => {
  await run(async () => {
    const err = new Error('upstream timeout');
    recordSwallowed(err);
    const swallowed = getSwallowed();
    assert.equal(swallowed.length, 1);
    assert.equal(swallowed[0].error.message, 'upstream timeout');
    assert.ok(swallowed[0].ts <= Date.now());
  });
});
