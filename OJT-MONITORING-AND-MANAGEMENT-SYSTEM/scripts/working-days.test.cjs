const test = require('node:test');
const assert = require('node:assert/strict');

test('nonWorkingDatesFor scopes rows to department and company ids', async () => {
  const { nonWorkingDatesFor, DEFAULT_REQUIRED_HOURS } = await import('../shared/expectedEnd.ts');
  const rows = [
    { day_date: '2026-12-25', scope: 'global', department: null, company_id: null },
    { day_date: '2026-11-01', scope: 'department', department: 'ICS', company_id: null },
    { day_date: '2026-11-02', scope: 'department', department: 'IBE', company_id: null },
    { day_date: '2026-11-03', scope: 'company', department: null, company_id: 'a' },
    { day_date: '2026-11-04', scope: 'company', department: null, company_id: 'b' },
  ];
  assert.deepEqual([...nonWorkingDatesFor(rows, 'ICS', ['a'])].sort(), ['2026-11-01', '2026-11-03', '2026-12-25']);
  assert.deepEqual([...nonWorkingDatesFor(rows, 'ICS', ['a', 'b'])].sort(), ['2026-11-01', '2026-11-03', '2026-11-04', '2026-12-25']);
  assert.deepEqual([...nonWorkingDatesFor(rows, null, [])], ['2026-12-25']);
  assert.equal(DEFAULT_REQUIRED_HOURS, 486);
});
