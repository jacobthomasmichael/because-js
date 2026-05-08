import { instrumentFetch } from './instruments/fetch.js';
import { instrumentHttp } from './instruments/http.js';
import { installHooks } from './enrichment.js';

export { enrich, formatContextChain } from './enrichment.js';
export { run, record, recordSwallowed, getTimeline, getSwallowed } from './buffer.js';

export function install({ fetch = true, http = true } = {}) {
  if (fetch) instrumentFetch();
  if (http) instrumentHttp();
  installHooks();
}
