const test = require('node:test');
const assert = require('node:assert/strict');

test('four documents gate scheduling and placement', async () => {
  const { GATEWAY_DOCUMENT_SPECS, getGatewayStatus, normalizeDocType, STUDENT_REPORT_TYPES, isCoordinatorReviewType } = await import('../shared/gateway.ts');
  assert.deepEqual(GATEWAY_DOCUMENT_SPECS.map(s => s.name), [
    'Parent/Guardian Consent Waiver', 'Medical Certificate', 'Pre-OJT Orientation Certificate', 'Endorsement Letter',
  ]);

  const two = getGatewayStatus([{ report_type: 'Pre-OJT Orientation Certificate' }, { report_type: 'Endorsement Letter' }]);
  assert.equal(two.isCleared, false, 'the old two documents are no longer enough');
  assert.deepEqual(two.missing, ['Parent/Guardian Consent Waiver', 'Medical Certificate']);
  assert.equal(two.approvedCount, 2);

  const all = getGatewayStatus([
    { report_type: 'Parent/Guardian Consent Waiver' }, { report_type: 'Medical Certificate' },
    { report_type: 'Pre-OJT Orientation Certificate' }, { report_type: 'Endorsement Letter' },
  ]);
  assert.equal(all.isCleared, true);

  // Legacy and loose spellings still count; an MOA is not an endorsement letter.
  assert.equal(normalizeDocType('Medical Clearance'), 'Medical Certificate');
  assert.equal(normalizeDocType('parental consent'), 'Parent/Guardian Consent Waiver');
  assert.equal(getGatewayStatus([{ report_type: 'MOA' }]).missing.includes('Endorsement Letter'), true);

  for (const name of ['Parent/Guardian Consent Waiver', 'Medical Certificate']) {
    assert.ok(STUDENT_REPORT_TYPES.includes(name), `${name} can be submitted from the app`);
    assert.equal(isCoordinatorReviewType(name), true, `${name} is reviewed by the Coordinator`);
  }
});
