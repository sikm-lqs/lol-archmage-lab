import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimumHaste, analyzePair, analyzeChampion, integerHaste, searchChampions } from '../src/engine.mjs';

const skill = (slot, cooldowns, status = 'standard') => ({ slot, cooldowns, maxRank: cooldowns.length, status });
test('equal CDs require exactly 233⅓ haste, integer recommendation is 234', () => {
  assert.ok(Math.abs(minimumHaste(10, 10) - 700 / 3) < 1e-10);
  assert.equal(integerHaste(minimumHaste(10, 10)), 234);
});
test('asymmetric CDs are symmetric and scale invariant', () => {
  assert.ok(Math.abs(minimumHaste(10, 8) - 316.6666666667) < 1e-8);
  assert.equal(minimumHaste(10, 8), minimumHaste(8, 10));
  assert.equal(minimumHaste(10, 8), minimumHaste(100, 80));
});
test('reject invalid CD and ratio rather than produce a zero-haste result', () => {
  for (const value of [0, -1, NaN, Infinity, null, '10']) assert.throws(() => minimumHaste(value, 10));
  assert.throws(() => minimumHaste(10, 10, 0));
});
test('preserve all equal minima, not merely the highest-ranked skills', () => {
  const pair = analyzePair(skill('Q', [10, 8]), skill('W', [10, 8]));
  assert.deepEqual(pair.best.map(c => [c.rankA, c.rankB]), [[1, 1], [2, 2]]);
  assert.equal(pair.combos.length, 4);
});
test('unknown interactions and missing data are excluded; charges included with annotation', () => {
  const result = analyzeChampion({ spells: [skill('Q', [5]), skill('W', [5], 'review'),
    skill('E', [5], 'charge'), skill('R', [0], 'missing')] });
  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].id, 'Q+E');
  assert.equal(result.pairs[0].estimated, true);
});
test('include R and do not impose an arbitrary haste cap', () => {
  const result = analyzeChampion({ spells: [skill('Q', [5]), skill('R', [100])] });
  assert.equal(result.pairs[0].id, 'Q+R');
  assert.ok(result.haste > 500);
});
test('threshold satisfies both directions; any lower value fails at least one', () => {
  for (const a of [1, 3, 8, 10, 22, 120]) for (const b of [2, 5, 10, 60]) {
    const h = minimumHaste(a, b);
    assert.ok(a / (1 + h / 100) <= .3 * b + 1e-10);
    assert.ok(b / (1 + h / 100) <= .3 * a + 1e-10);
    const lower = h - .001;
    assert.ok(a / (1 + lower / 100) > .3 * b || b / (1 + lower / 100) > .3 * a);
  }
});
test('search accepts Chinese names, titles, English names and whitespace; empty query returns all', () => {
  const rows = [{ id: 'Annie', name: '安妮', title: '黑暗之女' }, { id: 'Teemo', name: '提莫', title: '迅捷斥候' }];
  assert.equal(searchChampions(rows, '  annIE ')[0].id, 'Annie');
  assert.equal(searchChampions(rows, '黑暗')[0].id, 'Annie');
  assert.equal(searchChampions(rows, '').length, 2);
  assert.equal(searchChampions(rows, '没有').length, 0);
});
