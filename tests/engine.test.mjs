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
    { ...skill('E', [5], 'charge'), chargeCaps: [2] }, skill('R', [0], 'missing')] });
  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].id, 'Q+E');
  assert.equal(result.pairs[0].estimated, true);
});
test('hide pairs above 500 haste', () => {
  assert.equal(analyzeChampion({ spells: [skill('Q', [5]), skill('R', [100])] }).pairs.length, 0);
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

test('charged batches sustain BOTH refill directions and respect rank capacity', () => {
  const e = { ...skill('E', [17, 16, 15, 14, 13], 'charge'), chargeCaps: [3, 3, 4, 4, 5] };
  const pair = analyzePair(e, skill('R', [160, 140, 120]));
  assert.equal(pair.mode, 'near');
  assert.equal(pair.haste, 500);
  assert.equal(pair.remainingR, .5);
  assert.deepEqual(pair.best.map(c=>[c.rankA,c.rankB,c.castsA,c.castsB]), [[5,3,5,1]]);
  assert.ok(!pair.combos.some(c=>c.rankA===2)); // E2/R3 leaves more than five seconds.
  const reachable = analyzePair({ ...e, cooldowns: [17,16,15,14,14] }, skill('R', [120]));
  assert.equal(reachable.best[0].castsA, 5);
  assert.equal(reachable.best[0].rankA, 5);
  assert.ok(Math.abs(reachable.haste - (120 / (.3*70)-1)*100) < 1e-9);
});
test('Ashe E4/R3 permits simple equal-CD one-to-one cycling', () => {
  const pair = analyzePair({ ...skill('E', [90, 80, 70, 60, 50], 'charge'), chargeCaps: [2,2,2,2,2] }, skill('R', [100,80,60]));
  const c = pair.combos.find(c => c.rankA === 4 && c.rankB === 3);
  assert.ok(Math.abs(c.haste - 700/3) < 1e-10);
  assert.equal(c.castsA, 1);
});
test('batch refill cannot spend an initially full magazine indefinitely', () => {
  const pair = analyzePair({ ...skill('E', [100], 'charge'), chargeCaps: [5] }, skill('R', [10]));
  assert.equal(pair, null);
});
test('unknown capacities and double-charge pairs are not presented as proven minima', () => {
  const a = { ...skill('E', [10], 'charge'), chargeCaps: [3] };
  assert.equal(analyzePair(a, skill('Q', [10], 'charge')), null);
  assert.equal(analyzePair(a, { ...a, slot: 'R' }), null);
});
test('500 is inclusive; thresholds just above it are excluded before display rounding', () => {
  assert.ok(analyzePair(skill('Q', [10]), skill('W', [18])));
  assert.equal(analyzePair(skill('Q', [10]), skill('W', [18.000001])), null);
});

test('ordinary R grace includes five seconds, excludes more before rounding, in either slot order', () => {
  const atFive = analyzePair(skill('Q', [10]), skill('R', [48]));
  assert.equal(atFive.mode, 'near');
  assert.equal(atFive.haste, 500);
  assert.equal(atFive.remainingR, 5);
  assert.equal(analyzePair(skill('Q', [10]), skill('R', [48.000001])), null);
  assert.equal(analyzePair(skill('Q', [10]), skill('W', [48])), null);
  const reversed = analyzePair(skill('R', [48]), skill('E', [10]));
  assert.equal(reversed.remainingR, 5);
  assert.equal(reversed.mode, 'near');
});
test('R grace never excuses an unrefilled ordinary skill or charge magazine', () => {
  assert.equal(analyzePair(skill('Q', [100]), skill('R', [10])), null);
  assert.equal(analyzePair({ ...skill('E', [100], 'charge'), chargeCaps:[5] }, skill('R', [10])), null);
  assert.equal(analyzePair(skill('Q', [10]), { ...skill('R', [48], 'charge'), chargeCaps:[2] }), null);
});
test('near cycles optimize R wait, retain tied ranks and never become seamless ties', () => {
  const pair = analyzePair(skill('Q', [10, 10, 9]), skill('R', [48, 47]));
  assert.equal(pair.mode, 'near');
  assert.deepEqual(pair.best.map(c => [c.rankA,c.rankB]), [[1,2],[2,2]]);
  assert.ok(Math.abs(pair.remainingR - (47/6 - 3)) < 1e-10);
  const mixed = analyzePair(skill('Q', [10]), skill('R', [18,48]));
  assert.equal(mixed.mode, 'seamless');
  assert.equal(mixed.haste, 500);
  assert.equal(mixed.best.length, 1);
  assert.equal(mixed.combos.find(c=>c.rankB===2).mode, 'near');
  const champion = analyzeChampion({spells:[skill('Q',[10]),skill('W',[18]),skill('R',[48])]});
  assert.equal(champion.mode,'seamless');
  assert.deepEqual(champion.best.map(p=>p.id), ['Q+W']);
});
test('a hero with only a qualifying R grace pair remains visible and labelled near', () => {
  const result=analyzeChampion({spells:[skill('E',[10]),skill('R',[48])]});
  assert.equal(result.mode,'near');
  assert.equal(result.remainingR,5);
  assert.equal(result.best[0].id,'E+R');
});

test('R grace cannot count casts beyond rank capacity, and reversing charged slots preserves results', () => {
  const e = { ...skill('E',[10],'charge'), chargeCaps:[2] };
  assert.equal(analyzePair({...e,chargeCaps:[1]},skill('R',[66])),null);
  const pair=analyzePair(e,skill('R',[66]));
  assert.equal(pair.remainingR,5);
  assert.equal(pair.best[0].castsA,2);
  const reversed=analyzePair(skill('R',[66]),e);
  assert.equal(reversed.remainingR,5);
  assert.equal(reversed.best[0].castsB,2);
});
