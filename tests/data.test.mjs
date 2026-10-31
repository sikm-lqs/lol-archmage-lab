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
      const min = Math.min(...p.combos.map(combo => combo.haste));
      assert.equal(p.best.length, p.combos.filter(combo => nearlyEqual(combo.haste, min)).length);
      for (const combo of p.combos) {
        const factor = 1 + combo.haste / 100;
        assert.ok(combo.haste <= 500);
        assert.ok(combo.castsA <= combo.capA && combo.castsB <= combo.capB);
        if (p.a.status === 'charge') assert.equal(combo.capA, p.a.chargeCaps[combo.rankA - 1]);
        if (p.b.status === 'charge') assert.equal(combo.capB, p.b.chargeCaps[combo.rankB - 1]);
        assert.ok(combo.castsA * combo.cdA / factor <= .3 * combo.castsB * combo.cdB + 1e-8, `${c.id} ${p.id}`);
        assert.ok(combo.castsB * combo.cdB / factor <= .3 * combo.castsA * combo.cdA + 1e-8, `${c.id} ${p.id}`);
      }
    }
  }
});


test('charge capacities are rank-indexed from the locked primary snapshot', () => {
  const gp = data.champions.find(c => c.id === 'Gangplank');
  assert.deepEqual(gp.spells[2].chargeCaps, [3,3,4,4,5]);
  assert.ok(!analyzeChampion(gp).pairs.some(p => p.id === 'E+R'));
  for (const c of data.champions) for (const s of c.spells) if (s.status === 'charge') {
    assert.equal(s.chargeCaps.length, s.maxRank);
    assert.ok(s.chargeCaps.every(n => Number.isInteger(n) && n > 0));
  }
});
