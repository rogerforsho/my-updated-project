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

  // Legacy documents are still reviewed, but the app only accepts the combined file now.
  for (const name of ['Parent/Guardian Consent Waiver', 'Medical Certificate']) {
    assert.equal(STUDENT_REPORT_TYPES.includes(name), false, `${name} is no longer submitted on its own`);
    assert.equal(isCoordinatorReviewType(name), true, `${name} is reviewed by the Coordinator`);
  }
});

test('one combined Pre-deployment Requirements file replaces the four uploads', async () => {
  const { PRE_DEPLOYMENT_BUNDLE_TYPE, getGatewayStatus, STUDENT_REPORT_TYPES, isCoordinatorReviewType, isBundleType, BUNDLE_MAX_BYTES, BUNDLE_EXTENSIONS } = await import('../shared/gateway.ts');
  assert.ok(STUDENT_REPORT_TYPES.includes(PRE_DEPLOYMENT_BUNDLE_TYPE));
  assert.equal(isCoordinatorReviewType(PRE_DEPLOYMENT_BUNDLE_TYPE), true);
  assert.equal(isBundleType(PRE_DEPLOYMENT_BUNDLE_TYPE), true);
  assert.equal(isBundleType('Medical Certificate'), false);
  assert.equal(BUNDLE_MAX_BYTES, 25 * 1024 * 1024);
  assert.deepEqual(BUNDLE_EXTENSIONS, ['.pdf', '.docx', '.doc']);

  // Callers pass approved reports only, so one approved bundle clears the student.
  const cleared = getGatewayStatus([{ report_type: PRE_DEPLOYMENT_BUNDLE_TYPE }]);
  assert.equal(cleared.isCleared, true);
  assert.equal(cleared.approvedCount, 4);
  assert.deepEqual(cleared.missing, []);

  // No approved reports (a rejected or pending bundle is filtered out by the caller) means not cleared.
  assert.equal(getGatewayStatus([]).isCleared, false);
  // Three legacy documents are still not enough.
  assert.equal(getGatewayStatus([
    { report_type: 'Parent/Guardian Consent Waiver' }, { report_type: 'Medical Certificate' }, { report_type: 'Endorsement Letter' },
  ]).isCleared, false);
});
