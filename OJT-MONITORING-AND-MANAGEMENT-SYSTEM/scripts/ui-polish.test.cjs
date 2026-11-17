// Source-level checks for the UI polish pass (mobile Alerts archive, readable unread cards).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobile = path.join(__dirname, '../apps/mobile/src');
const screen = fs.readFileSync(path.join(mobile, 'screens/notifications/NotificationsScreen.tsx'), 'utf8');
const swipe = fs.readFileSync(path.join(mobile, 'components/SwipeToArchive.tsx'), 'utf8');

test('unread card is opaque so the Archive layer behind it does not show through', () => {
  const line = screen.split('\n').find((l) => l.includes('feedCardUnread:'));
  assert.ok(line, 'feedCardUnread style exists');
  assert.doesNotMatch(line, /rgba\(/);
});

test('personal notices have a tappable Archive button, not swipe only', () => {
  assert.match(screen, /accessibilityLabel="Archive"/);
});

test('swipe is easier to start and the action layer only shows while swiping', () => {
  assert.match(swipe, /THRESHOLD = -80/);
  assert.match(swipe, /interpolate/);
});
