import http from 'node:http';
import https from 'node:https';
import { record } from '../buffer.js';

function patchModule(mod, scheme) {
  const orig = mod.request.bind(mod);
  mod.request = function becauseRequest(options, callback) {
    let url;
    if (typeof options === 'string' || options instanceof URL) {
      url = options.toString();
    } else {
      const host = options.hostname ?? options.host ?? 'unknown';
      const port = options.port ? `:${options.port}` : '';
      url = `${scheme}://${host}${port}${options.path ?? '/'}`;
    }
    const method = (typeof options === 'object' ? options.method : null) ?? 'GET';
    const start = Date.now();

    const req = orig(options, callback);
    req.on('response', (res) => {
      record({ type: 'http', method, url, status: res.statusCode, duration: Date.now() - start });
    });
    req.on('error', (err) => {
      record({ type: 'http', method, url, status: null, duration: Date.now() - start, error: err.message });
    });
    return req;
  };
}

// http.get captures a local reference to request at module load time, bypassing the patch.
// Re-route it through the (now-patched) mod.request so recording is consistent.
function patchGet(mod) {
  mod.get = function becauseGet(options, callback) {
    const req = mod.request(options, callback);
    req.end();
    return req;
  };
}

export function instrumentHttp() {
  patchModule(http, 'http');
  patchModule(https, 'https');
  patchGet(http);
  patchGet(https);
}
