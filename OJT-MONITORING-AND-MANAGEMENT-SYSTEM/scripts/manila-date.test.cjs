const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../apps/web/src/lib/manila-date.ts');
// 23:30 UTC on 30 Nov is already 07:30 on 1 Dec in Manila, whatever the machine's timezone.
const lateUtc = new Date('2026-11-30T23:30:00Z');

test('today follows the Manila calendar day, not UTC', async () => {
  const { presetRange } = await load();
  assert.deepEqual(presetRange('today', lateUtc), ['2026-12-01', '2026-12-01']);
});

test('week starts six days before today and month starts on the 1st', async () => {
  const { presetRange } = await load();
  assert.deepEqual(presetRange('week', lateUtc), ['2026-11-25', '2026-12-01']);
  assert.deepEqual(presetRange('month', lateUtc), ['2026-12-01', '2026-12-01']);
});

test('all dates clears both ends', async () => {
  const { presetRange } = await load();
  assert.deepEqual(presetRange('all', lateUtc), ['', '']);
});
