// Demonstrates: rapid retries to a failing endpoint → retry storm pattern
// because detects the repeated failures and names the pattern.

import http from 'node:http';
import { install, run, enrich, formatContextChain } from '../src/index.js';

install({ fetch: false });

// Local server that always returns 503
const server = http.createServer((req, res) => {
  res.writeHead(503);
  res.end('Service Unavailable');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

async function callApi() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/api/data`, (res) => {
      if (res.status >= 500 || res.statusCode >= 500) {
        reject(new Error(`API returned ${res.statusCode}`));
      } else {
        resolve(res.statusCode);
      }
      res.resume();
    });
    req.on('error', reject);
  });
}

await run(async () => {
  // Naive retry loop: 3 attempts, all fail
  for (let i = 0; i < 3; i++) {
    try { await callApi(); } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 200));
  }

  // Final attempt — because surfaces the retry storm
  try {
    await callApi();
  } catch (err) {
    enrich(err);
    process.stderr.write(err.stack + formatContextChain(err) + '\n');
    server.close();
    process.exit(1);
  }
});
