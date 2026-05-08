// Demonstrates: caught-and-swallowed error upstream → null dereference downstream
// because detects the swallowed error and surfaces it as the likely cause.

import { install, run, recordSwallowed, enrich, formatContextChain } from '../src/index.js';

install({ fetch: false, http: false });

await run(async () => {
  // Step 1: auth check fails; caller swallows the error and continues with null
  let user = null;
  try {
    throw new Error('auth service returned 503');
  } catch (err) {
    recordSwallowed(err);
    console.error('[app] auth check failed, continuing with defaults');
  }

  // Step 2: downstream code assumes auth succeeded → TypeError
  try {
    console.log(user.id);
  } catch (err) {
    enrich(err);
    process.stderr.write(err.stack + formatContextChain(err) + '\n');
    process.exit(1);
  }
});
