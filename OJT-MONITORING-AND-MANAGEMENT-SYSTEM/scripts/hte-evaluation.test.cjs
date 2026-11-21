const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../shared/hteEvaluation.ts');
const all = value => Object.fromEntries(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2'].map(id => [id, value]));

test('the criteria match the ICS form: 11 criteria worth 100 percent', async () => {
  const { HTE_EVALUATION_SECTIONS } = await load();
  const criteria = HTE_EVALUATION_SECTIONS.flatMap(s => s.criteria);
  assert.equal(criteria.length, 11);
  assert.equal(criteria.reduce((sum, c) => sum + c.weight, 0), 100);
  assert.deepEqual(HTE_EVALUATION_SECTIONS.map(s => s.criteria.length), [3, 3, 3, 2]);
});

test('all 5s is 100, all 1s is 20, and a missing rating counts as zero', async () => {
  const { scoreHteEvaluation, scoreHteSection } = await load();
  assert.equal(scoreHteEvaluation(all(5)), 100);
  assert.equal(scoreHteEvaluation(all(1)), 20);
  assert.equal(scoreHteEvaluation({ A1: 5 }), 10);
  assert.equal(scoreHteSection(all(5), 'D'), 100);
  assert.equal(scoreHteSection({ D1: 5 }, 'D'), 50);
});

test('ratings are rejected unless all 11 are whole numbers from 1 to 5', async () => {
  const { isValidHteRatings } = await load();
  assert.equal(isValidHteRatings(all(3)), true);
  const missing = all(3); delete missing.D2;
  assert.equal(isValidHteRatings(missing), false);
  assert.equal(isValidHteRatings({ ...all(3), A1: 0 }), false);
  assert.equal(isValidHteRatings({ ...all(3), A1: 6 }), false);
  assert.equal(isValidHteRatings({ ...all(3), A1: 2.5 }), false);
  assert.equal(isValidHteRatings({ ...all(3), A1: '4' }), false);
  assert.equal(isValidHteRatings({ ...all(3), Z9: 3 }), false);
  assert.equal(isValidHteRatings(null), false);
  assert.equal(isValidHteRatings([]), false);
});
