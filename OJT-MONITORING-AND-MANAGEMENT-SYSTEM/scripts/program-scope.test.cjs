const test = require('node:test');
const assert = require('node:assert/strict');

test('program access helpers turn a picked list into department grants', async () => {
  const { programGrants, accessPrograms, programForCourse } = await import('../shared/courses.ts'); // Node 23+ strips TS types natively
  // All programs of a department = the whole department (null); part of it = just those programs.
  assert.deepEqual(programGrants(['BSIT', 'BS-CPE']), [{ department: 'ICS', programs: null }]);
  assert.deepEqual(programGrants(['BSIT']), [{ department: 'ICS', programs: ['BSIT'] }]);
  assert.deepEqual(programGrants(['BSENTREP', 'BSIT']), [{ department: 'ICS', programs: ['BSIT'] }, { department: 'IBE', programs: ['BSENTREP'] }]);
  assert.deepEqual(programGrants([]), []);
  assert.deepEqual(programGrants(['XYZ']), [], 'unknown programs grant nothing');
  // A department code means all its programs.
  assert.deepEqual(accessPrograms(['ICS', 'BSIT', 'BSENTREP']), ['BSIT', 'BS-CPE', 'BSENTREP']);
  assert.deepEqual(accessPrograms(undefined), []);
  assert.deepEqual(accessPrograms(['XYZ']), ['XYZ'], 'unknown values stay so the caller can reject them');
  // Same mapping as program_key_for_course() in the database, including legacy spellings.
  for (const [course, program] of [['BSIT', 'BSIT'], ['Information Technology', 'BSIT'], ['BSCpE', 'BS-CPE'], ['Computer Engineering', 'BS-CPE'], ['BSBA-HRM', 'BSBA-HRM'], ['BSENTREP', 'BSENTREP'], ['BSCS', null], ['BSA', null], ['', null], [null, null]])
    assert.equal(programForCourse(course), program, String(course));
});
