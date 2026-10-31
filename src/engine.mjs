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

export function analyzePair(a, b) {
  const combos = [];
  for (let i = 0; i < a.maxRank; i++) for (let j = 0; j < b.maxRank; j++) {
    const cdA = a.cooldowns[i], cdB = b.cooldowns[j];
    if (!valid(cdA) || !valid(cdB)) continue;
    combos.push({ rankA: i + 1, rankB: j + 1, cdA, cdB, haste: minimumHaste(cdA, cdB) });
  }
  if (!combos.length) return null;
  combos.sort((x, y) => x.haste - y.haste || x.rankA - y.rankA || x.rankB - y.rankB);
  const haste = combos[0].haste;
  return {
    id: `${a.slot}+${b.slot}`, a, b, haste, combos,
    best: combos.filter(c => nearlyEqual(c.haste, haste)),
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
  pairs.sort((a, b) => a.haste - b.haste || a.id.localeCompare(b.id));
  return { pairs, haste: pairs[0]?.haste ?? null,
    best: pairs.filter(p => nearlyEqual(p.haste, pairs[0].haste)) };
}

export function searchChampions(champions, query) {
  const value = query.trim().toLocaleLowerCase();
  return champions.filter(c => `${c.name} ${c.title} ${c.id}`.toLocaleLowerCase().includes(value));
}
