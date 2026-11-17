const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps/web/src/services/supervisorInvites.ts'), 'utf8');

test('a successful sign-up notifies the Coordinator who created the link', () => {
  const accept = src.slice(src.indexOf('export async function acceptSupervisorInvite'), src.indexOf('export async function checkInviteRecipient'));
  assert.match(accept, /from\('notifications'\)\.insert\(/);
  assert.match(accept, /receiver_user_id:\s*made\.created_by/);
  assert.ok(accept.indexOf('SUPERVISOR_INVITE_USED') < accept.indexOf("from('notifications')"), 'notify only after the account exists');
  assert.match(accept, /try \{[\s\S]*notifications[\s\S]*\} catch/, 'a failed notification must not fail the sign-up');
});

test('checkInviteRecipient is Coordinator-only before it reads users', () => {
  const check = src.slice(src.indexOf('export async function checkInviteRecipient'));
  assert.ok(check.indexOf('grantedCoordinator()') > -1 && check.indexOf('grantedCoordinator()') < check.indexOf("from('users')"));
});
