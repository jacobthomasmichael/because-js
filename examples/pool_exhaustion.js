// Demonstrates: repeated ECONNREFUSED to a TCP endpoint → pool exhaustion pattern
// because detects clustered connection errors and names the likely cause.

import net from 'node:net';
import { install, run, record, enrich, formatContextChain } from '../src/index.js';

install({ fetch: false, http: false });

// Simulate connection attempts to a port with nothing listening
async function connectToDb() {
  return new Promise((_, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port: 19999 });
    sock.on('error', (err) => {
      // manually record since we're using net directly
      record({ type: 'http', method: 'CONNECT', url: 'postgres://127.0.0.1:19999', error: err.message });
      reject(err);
    });
  });
}

await run(async () => {
  // Exhaust connections: all fail with ECONNREFUSED
  for (let i = 0; i < 4; i++) {
    try { await connectToDb(); } catch { /* swallowed at pool layer */ }
  }

  // Now a real query is attempted — because surfaces the connection pattern
  try {
    await connectToDb();
  } catch (err) {
    enrich(err);
    process.stderr.write(err.stack + formatContextChain(err) + '\n');
    process.exit(1);
  }
});
