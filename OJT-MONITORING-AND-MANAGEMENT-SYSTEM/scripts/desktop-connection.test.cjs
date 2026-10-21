const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { checkServerReady } = require('../apps/desktop/src/portal-connection');

test('desktop readiness check reports a paused cloud response instead of treating it as ready', async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(request.url === '/paused' ? 503 : 200);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await checkServerReady(`${baseUrl}/ready`), { ready: true, statusCode: 200 });
  assert.deepEqual(await checkServerReady(`${baseUrl}/paused`), { ready: false, statusCode: 503 });
});

test('desktop readiness check reports invalid protocols safely', async () => {
  assert.deepEqual(await checkServerReady('file:///tmp/portal'), {
    ready: false,
    errorCode: 'INVALID_URL',
  });
});

test('desktop loader shows a server outage and enables manual retry', () => {
  const loader = fs.readFileSync(path.join(__dirname, '../apps/desktop/src/loader.html'), 'utf8');
  const inlineScript = loader.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(inlineScript, 'loader inline script exists');

  const elements = new Map();
  for (const id of ['status-text', 'hint-text', 'btn-retry', 'connection-progress']) {
    elements.set(id, { innerText: '', innerHTML: '', disabled: false, style: {} });
  }
  let onConnectionState;
  const window = {
    location: { search: '?url=https%3A%2F%2Fportal.example.test%2Fauth%2Fsign-in&isProd=1' },
    electronAPI: {
      onPortalConnectionState(callback) { onConnectionState = callback; },
      retryConnection() {},
    },
  };
  vm.runInNewContext(inlineScript, {
    window,
    document: { getElementById: (id) => elements.get(id) },
    URLSearchParams,
  });

  onConnectionState({ phase: 'unavailable', statusCode: 503, retryInSeconds: 15 });
  assert.equal(elements.get('status-text').innerText, 'Portal unavailable (HTTP 503)');
  assert.match(elements.get('hint-text').innerText, /retry in 15 seconds/);
  assert.equal(elements.get('btn-retry').disabled, false);
  assert.equal(elements.get('connection-progress').style.display, 'none');
});
