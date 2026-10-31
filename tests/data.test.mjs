import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { analyzeChampion, nearlyEqual } from '../src/engine.mjs';

const root = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('public/data/champions.json', root)));

test('fixed snapshot has unique heroes and four explicit spell slots', () => {
  assert.equal(data.patch, '16.21.1');
  assert.equal(data.champions.length, 173);
  assert.equal(new Set(data.champions.map(c => c.id)).size, 173);
  for (const c of data.champions) assert.deepEqual(c.spells.map(s => s.slot), [...'QWER']);
});

test('all local sprite references exist and crops fit actual PNG dimensions', async () => {
  for (const c of data.champions) for (const i of [c.icon, ...c.spells.map(s => s.icon)]) {
    assert.match(i.sprite, /^[\w-]+\.png$/);
    const path = new URL(`public/assets/${i.sprite}`, root);
    await access(path);
    const png = await readFile(path);
    assert.equal(png.readUInt32BE(16), 480);
    assert.ok(i.x >= 0 && i.y >= 0 && i.x + i.w <= 480 && i.y + i.h <= png.readUInt32BE(20));
  }
});

test('only complete positive rank arrays are eligible; exclusions remain documented', () => {
  const counts = {};
  for (const c of data.champions) for (const s of c.spells) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
    if (['standard', 'charge'].includes(s.status)) {
      assert.equal(s.cooldowns.length, s.maxRank, `${c.id}.${s.slot}`);
      assert.ok(s.cooldowns.every(cd => typeof cd === 'number' && cd > 0 && Number.isFinite(cd)));
    } else assert.ok(s.notes.length > 0);
    assert.ok(s.description.length > 0);
  }
  assert.deepEqual(counts, data.counts);
});

test('internal ammo is not confused with player-stored charges', () => {
  for (const [id, slots] of [['Karthus', 'Q'], ['Leblanc', 'R'], ['Rengar', 'QWE'], ['Warwick', 'W']]) {
    const c = data.champions.find(c => c.id === id);
    for (const slot of slots) assert.notEqual(c.spells.find(s => s.slot === slot).status, 'charge');
  }
  const teemo = data.champions.find(c => c.id === 'Teemo');
  assert.equal(teemo.spells[3].status, 'charge');
  assert.deepEqual(teemo.spells[3].cooldowns, [35, 30, 25]);
});

test('all computed combinations independently satisfy both refund inequalities', () => {
  for (const c of data.champions) {
    const result = analyzeChampion(c);
    for (const p of result.pairs) {
      const seamless = p.combos.filter(c => c.mode === 'seamless');
      const pool = seamless.length ? seamless : p.combos;
      const min = Math.min(...pool.map(c => seamless.length ? c.haste : c.remainingR));
      const expected = pool.filter(c => nearlyEqual(seamless.length ? c.haste : c.remainingR, min));
      assert.deepEqual(p.best, expected);
      for (const combo of p.combos) {
        const factor = 1 + combo.haste / 100;
        assert.ok(combo.haste <= 500);
        assert.ok(combo.castsA <= combo.capA && combo.castsB <= combo.capB);
        if (p.a.status === 'charge') assert.equal(combo.capA, p.a.chargeCaps[combo.rankA - 1]);
        if (p.b.status === 'charge') assert.equal(combo.capB, p.b.chargeCaps[combo.rankB - 1]);
        const graceA = combo.mode === 'near' && p.a.slot === 'R' ? combo.remainingR : 0;
        const graceB = combo.mode === 'near' && p.b.slot === 'R' ? combo.remainingR : 0;
        if (combo.mode === 'near') {
          assert.equal(combo.haste, 500);
          assert.ok(combo.remainingR > 0 && combo.remainingR <= 5);
          assert.ok([p.a,p.b].some(s=>s.slot==='R' && s.status==='standard'));
          const residual = p.a.slot === 'R' ? combo.cdA / 6 - .3 * combo.castsB * combo.cdB :
            combo.cdB / 6 - .3 * combo.castsA * combo.cdA;
          assert.ok(nearlyEqual(residual, combo.remainingR));
        } else assert.equal(combo.remainingR, 0);
        for (const cycle of combo.cycles) {
          assert.ok(cycle.castsA <= combo.capA && cycle.castsB <= combo.capB);
          assert.ok(cycle.castsA * combo.cdA / factor <= .3 * cycle.castsB * combo.cdB + graceA + 1e-8, `${c.id} ${p.id}`);
          assert.ok(cycle.castsB * combo.cdB / factor <= .3 * cycle.castsA * combo.cdA + graceB + 1e-8, `${c.id} ${p.id}`);
        }
      }
    }
  }
});


test('charge capacities are rank-indexed from the locked primary snapshot', () => {
  const gp = data.champions.find(c => c.id === 'Gangplank');
  assert.deepEqual(gp.spells[2].chargeCaps, [3,3,4,4,5]);
  assert.equal(analyzeChampion(gp).pairs.find(p => p.id === 'E+R').remainingR, .5);
  for (const c of data.champions) for (const s of c.spells) if (s.status === 'charge') {
    assert.equal(s.chargeCaps.length, s.maxRank);
    assert.ok(s.chargeCaps.every(n => Number.isInteger(n) && n > 0));
  }
});
