const valid = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
export const nearlyEqual = (a, b) => Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));

export function minimumHaste(cdA, cdB, ratio = .3) {
  if (![cdA, cdB, ratio].every(valid) || ratio > 1) throw new RangeError('CD 和返还比例必须是有效正数');
  return Math.max(0, 100 * Math.max(cdA / (ratio * cdB) - 1, cdB / (ratio * cdA) - 1));
}

export function integerHaste(haste) {
  // Only remove floating-point noise, never round a fractional threshold down.
  const integer = Math.round(haste);
  return nearlyEqual(haste, integer) ? integer : Math.ceil(haste);
}

// Fixed-500 grace results must never tie with minimum-haste seamless results.
export function compareOutcomes(a, b) {
  if (a.mode !== b.mode) return a.mode === 'near' ? 1 : -1;
  return a.haste - b.haste || a.remainingR - b.remainingR;
}

export function sameOptimum(a, b) {
  return Boolean(a && b && a.mode === b.mode && nearlyEqual(a.haste, b.haste) &&
    nearlyEqual(a.remainingR, b.remainingR));
}

export function analyzePair(a, b) {
  // A single charged ability can cast a bounded batch between ordinary casts.
  // Two charged abilities require a general interleaving solver: do not claim
  // a global optimum by merely enumerating two bounded batches.
  if (a.status === 'charge' && b.status === 'charge') return null;
  const combos = [];
  for (let i = 0; i < a.maxRank; i++) for (let j = 0; j < b.maxRank; j++) {
    const cdA = a.cooldowns[i], cdB = b.cooldowns[j];
    if (!valid(cdA) || !valid(cdB)) continue;
    const capA = a.status === 'charge' ? a.chargeCaps?.[i] : 1;
    const capB = b.status === 'charge' ? b.chargeCaps?.[j] : 1;
    if (![capA, capB].every(n => Number.isInteger(n) && n > 0)) continue;
    const cycles = [];
    for (let castsA = 1; castsA <= capA; castsA++) for (let castsB = 1; castsB <= capB; castsB++) {
      const totalA = castsA * cdA, totalB = castsB * cdB;
      const haste = minimumHaste(totalA, totalB);
      if (haste <= 500) {
        cycles.push({ castsA, castsB, haste, mode: 'seamless', remainingR: 0 });
        continue;
      }
      // Only ordinary R may retain cooldown. The other skill must be fully
      // restored by R's refund alone, without borrowing natural regeneration.
      const rIsA = a.slot === 'R' && a.status === 'standard';
      const rIsB = b.slot === 'R' && b.status === 'standard';
      if (!rIsA && !rIsB) continue;
      const totalR = rIsA ? totalA : totalB;
      const totalOther = rIsA ? totalB : totalA;
      const remainingR = totalR / 6 - .3 * totalOther;
      if (totalOther / 6 <= .3 * totalR && remainingR > 0 && remainingR <= 5) {
        cycles.push({ castsA, castsB, haste: 500, mode: 'near', remainingR });
      }
    }
    if (!cycles.length) continue;
    cycles.sort(compareOutcomes);
    const { haste, mode, remainingR } = cycles[0];
    const bestCycles = cycles.filter(c => sameOptimum(c, cycles[0]));
    combos.push({ rankA: i + 1, rankB: j + 1, cdA, cdB, haste, mode, remainingR, capA, capB,
      castsA: bestCycles[0].castsA, castsB: bestCycles[0].castsB, cycles: bestCycles });
  }
  if (!combos.length) return null;
  combos.sort((x, y) => compareOutcomes(x, y) || x.rankA - y.rankA || x.rankB - y.rankB);
  const { haste, mode, remainingR } = combos[0];
  return {
    id: `${a.slot}+${b.slot}`, a, b, haste, mode, remainingR, combos,
    best: combos.filter(c => sameOptimum(c, combos[0])),
    estimated: a.status === 'charge' || b.status === 'charge',
  };
}

export function analyzeChampion(champion, { includeR = true, includeCharges = true } = {}) {
  const spells = champion.spells.filter(s =>
    (s.status === 'standard' || (includeCharges && s.status === 'charge')) &&
    (includeR || s.slot !== 'R'));
  const pairs = [];
  for (let i = 0; i < spells.length; i++) for (let j = i + 1; j < spells.length; j++) {
    const pair = analyzePair(spells[i], spells[j]);
    if (pair) pairs.push(pair);
  }
  pairs.sort((a, b) => compareOutcomes(a, b) || a.id.localeCompare(b.id));
  return { pairs, haste: pairs[0]?.haste ?? null,
    mode: pairs[0]?.mode ?? null, remainingR: pairs[0]?.remainingR ?? null,
    best: pairs.filter(p => sameOptimum(p, pairs[0])) };
}

export function searchChampions(champions, query) {
  const value = query.trim().toLocaleLowerCase();
  return champions.filter(c => `${c.name} ${c.title} ${c.id}`.toLocaleLowerCase().includes(value));
}
