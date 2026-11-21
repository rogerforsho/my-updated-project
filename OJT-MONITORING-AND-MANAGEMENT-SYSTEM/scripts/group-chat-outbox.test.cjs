// Source-level checks for the offline Group Chat outbox (the repo tests mobile logic by reading the source).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const screen = read('apps/mobile/src/screens/group/GroupScreen.tsx');
const service = read('apps/mobile/src/services/groupChat.ts');
const route = read('apps/web/app/api/mobile/group-chat/route.ts');

test('a message is saved on the phone before it is sent', () => {
  const send = screen.slice(screen.indexOf('const send = async'), screen.indexOf('const discard'));
  assert.ok(send.indexOf('enqueueChatMessage') > -1 && send.indexOf('enqueueChatMessage') < send.indexOf('await flush()'));
});

test('the outbox keeps order and only gives up on messages the server refused', () => {
  const flush = service.slice(service.indexOf('async function runFlush'));
  assert.match(service, /REFUSED = new Set\(\['VALIDATION_FAILURE', 'FORBIDDEN'\]\)/);
  assert.match(flush, /isNetworkAvailable/);
  assert.match(flush, /else return;/); // any other failure stops, so later messages never jump ahead
});

test('every send carries a client_id and the route passes it to the database', () => {
  assert.match(service, /client_id: clientId/);
  assert.match(route, /p_client_id: clientId/);
});

test('messages already stored are not shown twice as "Sending"', () => {
  assert.match(screen, /outbox\.filter\(i => !sent\.has\(i\.client_id\)\)/);
});
