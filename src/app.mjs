import { analyzeChampion, integerHaste, nearlyEqual, searchChampions } from './engine.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const threshold = value => nearlyEqual(value, 700 / 3) ? '233⅓' : number(value);
const seconds = value => `${number(value)}<span class="unit">s</span>`;
const classNames = { Assassin: '刺客', Fighter: '战士', Mage: '法师', Marksman: '射手', Support: '辅助', Tank: '坦克' };
let snapshot, champions = [], selectedId = 'Brand', selectedPair, chosenCombo, analyses = new Map();
const state = { query: '', includeR: true, includeCharges: true, sort: 'haste' };

function icon(image, size = 40) {
  if (!image || !/^[a-zA-Z0-9_-]+\.png$/.test(image.sprite)) return '<span class="icon-fallback" aria-hidden="true">?</span>';
  const scale = size / 48;
  return `<span class="game-icon" aria-hidden="true" style="width:${size}px;height:${size}px;background-image:url('./assets/${escape(image.sprite)}');background-position:-${image.x * scale}px -${image.y * scale}px;background-size:${480 * scale}px auto"></span>`;
}

function rebuild() {
  if (!snapshot || !champions.length) return;
  analyses = new Map(champions.map(champion => [champion.id, analyzeChampion(champion, state)]));
  if (analyses.get(selectedId)?.haste === null) selectedId = champions.find(c => analyses.get(c.id).haste !== null)?.id;
  selectedPair = null;
  chosenCombo = null;
  renderList();
  renderDetail();
}

function renderList() {
  const rows = searchChampions(champions, state.query).filter(c => analyses.get(c.id).haste !== null).sort((a, b) =>
    state.sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') :
      (analyses.get(a.id).haste ?? Infinity) - (analyses.get(b.id).haste ?? Infinity) ||
      a.name.localeCompare(b.name, 'zh-CN'));
  $('#result-count').textContent = rows.length;
  $('#champion-list').innerHTML = rows.length ? rows.map(c => {
    const analysis = analyses.get(c.id);
    return `<button class="champion-row ${c.id === selectedId ? 'selected' : ''}" data-champion="${escape(c.id)}" aria-pressed="${c.id === selectedId}">
      ${icon(c.icon)}<span class="champion-label"><strong>${escape(c.name)}</strong><span>${analysis.best.length ? analysis.best.map(p => p.id).join(' / ') : '暂无可计算技能对'}</span></span>
      <span class="row-haste">${analysis.haste === null ? '待核验' : threshold(analysis.haste)}</span></button>`;
  }).join('') : '<div class="empty"><span aria-hidden="true">⌕</span><strong>没有符合条件的英雄</strong><p>仅显示所需急速 ≤ 500 的结果。也可尝试其他名称或调整筛选。</p><button class="text-button" data-clear>清空搜索</button></div>';
}

function comboTag(pair, combo, clickable = false) {
  const label = `${pair.a.slot}${combo.rankA} + ${pair.b.slot}${combo.rankB}`;
  return clickable ? `<button class="combo-tag ${chosenCombo === combo ? 'active' : ''}" data-ranks="${combo.rankA},${combo.rankB}" aria-pressed="${chosenCombo === combo}">${label}</button>` :
    `<span class="combo-tag">${label}</span>`;
}

function renderDetail() {
  if (!selectedId) {
    $('#detail').innerHTML = '<div class="no-analysis"><h2>当前筛选没有可显示的结果</h2><p>仅展示最低技能急速不超过 500 的技能对。</p></div>';
    return;
  }
  const champion = champions.find(c => c.id === selectedId);
  const analysis = analyses.get(selectedId);
  const pair = analysis.pairs.find(p => p.id === selectedPair) ?? analysis.pairs[0];
  selectedPair = pair?.id;
  if (pair && !pair.combos.includes(chosenCombo)) chosenCombo = pair.best[0];
  const excluded = champion.spells.filter(s => ['missing', 'review'].includes(s.status));
  $('#detail').innerHTML = `
    <div class="champion-heading"><div class="champion-identity">${icon(champion.icon, 64)}<div><p class="eyebrow">${escape(champion.id.toUpperCase())} / ${escape(champion.title)}</p><h2>${escape(champion.name)}<span class="hero-tag">${classNames[champion.tags[0]] ?? '英雄'}</span></h2></div></div><span class="snapshot-pill">固定快照 ${escape(snapshot.patch)}</span></div>
    ${analysis.haste === null ? `<div class="no-analysis"><h3>这位英雄暂没有可计算的技能对</h3><p>数据缺失、特殊交互或当前筛选使可用技能不足两个。可以查看下方技能说明；“待核验”不代表不能互刷。</p></div>` : `
    <div class="summary-panel">
      <div class="summary-main"><p class="eyebrow">LOWEST ABILITY HASTE</p><div class="big-number">${threshold(analysis.haste)}<span>技能急速</span></div><p>整数急速至少 <strong>${integerHaste(analysis.haste)}</strong><span class="summary-dot">·</span>对应冷却缩减 ${number(analysis.haste / (100 + analysis.haste) * 100)}%</p></div>
      <div class="summary-right"><span class="mini-label">该英雄最优技能对</span><div class="best-pair-icons">${analysis.best.map(p => `<button class="best-pair-button ${pair.id === p.id ? 'active' : ''}" data-pair="${p.id}" aria-pressed="${pair.id === p.id}">${icon(p.a.icon, 32)}<span>${p.a.slot}<span class="pair-link">↔</span>${p.b.slot}</span>${icon(p.b.icon, 32)}</button>`).join('')}</div><span class="summary-footnote">${analysis.best.reduce((sum, p) => sum + p.best.length, 0)} 组并列最优加点 · 不按技能等级舍弃解</span></div>
    </div>
    <div class="section-heading"><h3>技能对研究台</h3><span>比较全部候选组合</span></div>
    <div class="pair-tabs" role="group" aria-label="选择技能对">${analysis.pairs.map(p => `<button class="pair-tab ${p.id === pair.id ? 'active' : ''}" data-pair="${p.id}" aria-pressed="${p.id === pair.id}"><span>${p.a.slot}<span class="pair-link">↔</span>${p.b.slot}${p.estimated ? '<span class="estimate-dot" title="含充能估算">◦</span>' : ''}</span><small>${threshold(p.haste)}</small></button>`).join('')}</div>
    ${renderResearch(pair, analysis)}
    `}
    <div class="section-heading skill-section-heading"><h3>技能档案</h3><span>点击查看说明与逐级冷却</span></div>
    <div class="skill-archive">${champion.spells.map(s => renderSkill(s)).join('')}</div>
    ${excluded.length ? `<p class="exclusion-note"><span aria-hidden="true">ⓘ</span> ${excluded.map(s => s.slot).join(' / ')} 暂不参与排名：特殊交互待核验或 CD 数据不足。</p>` : ''}
    <div class="detail-bottom"><span class="live-dot"></span>按约定模型计算，不评估英雄强度<span class="detail-bottom-right">REFUND RATIO / 0.30</span></div>`;
}

function renderResearch(pair, analysis) {
  const combo = chosenCombo;
  const factor = 1 + combo.haste / 100;
  const actualA = combo.cdA / factor, actualB = combo.cdB / factor;
  const isBest = nearlyEqual(combo.haste, pair.haste);
  return `<div class="research-panel">
    <div class="research-title"><div><span class="mini-label">${pair.id === analysis.best[0]?.id || nearlyEqual(pair.haste, analysis.haste) ? '最优技能对' : '候选技能对'}</span><h4>${escape(pair.a.name)}<span class="pair-link">↔</span>${escape(pair.b.name)}</h4></div><span class="status-pill ${pair.estimated ? 'estimated' : ''}">${pair.estimated ? '充能循环 · 理论推算' : '普通 CD 理论模型'}</span></div>
    <div class="optimal-combos"><div class="combo-heading"><span>该技能对的最优加点</span><strong>${pair.best.length} 组并列</strong></div><div class="combo-list">${pair.best.slice(0, 6).map(c => comboTag(pair, c, true)).join('')}</div>
    ${pair.best.length > 6 ? `<details class="more-combos"><summary>展开其余 ${pair.best.length - 6} 组最优加点</summary><div class="combo-list">${pair.best.slice(6).map(c => comboTag(pair, c, true)).join('')}</div></details>` : ''}</div>
    <div class="rank-controls"><span class="mini-label">调整加点 · 仅显示 ≤ 500 急速搭配</span><div>${[pair.a, pair.b].map((s, i) => {
      const ranks = [...new Set(pair.combos.filter(c => !i || c.rankA === combo.rankA).map(c => i ? c.rankB : c.rankA))].sort((a,b) => a-b);
      return `<label>${s.slot} 等级 <select id="rank-${i ? 'b' : 'a'}" aria-label="${s.slot}技能等级">${ranks.map(n => `<option value="${n}" ${n === (i ? combo.rankB : combo.rankA) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    }).join('')}<span class="selection-result">${threshold(combo.haste)} 急速 <span class="${isBest ? 'good-text' : 'muted'}">${isBest ? '· 已达最优' : '· 非最优搭配'}</span></span></div></div>
    <div class="cooldown-grid">${[
      [pair.a, combo.rankA, combo.cdA, actualA], [pair.b, combo.rankB, combo.cdB, actualB],
    ].map(([s, rank, cd, actual]) => `<div class="cooldown-card"><div class="cooldown-card-title">${icon(s.icon, 36)}<span><strong>${s.slot}${rank}</strong><span>${escape(s.name)}</span></span></div><div class="cd-equation"><div><span>基础冷却</span><strong>${seconds(cd)}</strong></div><span class="equation-arrow">→</span><div><span>急速后冷却</span><strong class="teal">${seconds(actual)}</strong></div></div></div>`).join('')}</div>
    <div class="refund-proof"><div class="proof-heading"><span class="proof-mark" aria-hidden="true">↻</span><strong>为什么可以互刷？</strong><span>按当前搭配的精确门槛计算</span></div>
      <div class="proof-row"><span>施放 <b>${pair.a.slot} × ${combo.castsA}</b><span class="proof-arrow">→</span>返还 <b>${pair.b.slot}</b></span><span>${combo.castsA} × ${number(combo.cdA)} × 30% = <strong>${seconds(combo.castsA * combo.cdA * .3)}</strong></span><span class="proof-check">≥ ${pair.b.slot} ${combo.castsB} 次回复 ${number(actualB * combo.castsB)}s <b>✓</b></span></div>
      <div class="proof-row"><span>施放 <b>${pair.b.slot} × ${combo.castsB}</b><span class="proof-arrow">→</span>返还 <b>${pair.a.slot}</b></span><span>${combo.castsB} × ${number(combo.cdB)} × 30% = <strong>${seconds(combo.castsB * combo.cdB * .3)}</strong></span><span class="proof-check">≥ ${pair.a.slot} ${combo.castsA} 次回复 ${number(actualA * combo.castsA)}s <b>✓</b></span></div>
      <p>${pair.estimated ? `可持续循环：${combo.cycles.map(c => `${pair.a.slot} × ${c.castsA} ↔ ${pair.b.slot} × ${c.castsB}`).join(' 或 ')}。充能容量：${pair.a.slot} ${combo.capA} / ${pair.b.slot} ${combo.capB}（普通技能记为 1）。每轮既能补回消耗的充能，也能刷新另一技能，不仅是打完初始存量。船长多层返还机制为用户实测；其他英雄为同机制外推，仍待实测。` : '两次返还均足以清空另一技能的完整冷却，即满足 A ↔ B 无等待循环。'}</p></div>
    <div class="research-footnote">精确门槛约 ${combo.haste.toFixed(6)}；整数急速至少 ${integerHaste(combo.haste)}。显示数值经过舍入，不用于内部判定。</div>
    </div>`;
}

function renderSkill(skill) {
  const labels = { standard: '理论计算', charge: '充能估算', review: '交互待核验', missing: 'CD 数据不足' };
  return `<details class="skill-entry"><summary>${icon(skill.icon, 36)}<span class="slot-key">${skill.slot}</span><strong>${escape(skill.name)}</strong><span class="skill-status ${skill.status}">${labels[skill.status]}</span><span class="expand-sign" aria-hidden="true">+</span></summary>
    <div class="skill-content"><p>${escape(skill.description).replace(/\n/g, '<br>')}</p><div class="rank-cd-list">${skill.cooldowns.map((cd, i) => `<div><span>${i + 1} 级${skill.chargeCaps ? ` · ${skill.chargeCaps[i]} 层` : ''}</span><strong>${cd > 0 ? `${number(cd)}s` : '—'}</strong></div>`).join('')}</div><small>${skill.status === 'charge' ? '以上为恢复一层充能的基础时间。' : '以上为当前技能等级、急速缩减前的基础 CD。'} 来源：${escape(skill.source)}。</small>${skill.notes.map(note => `<p class="skill-note">${escape(note)}</p>`).join('')}</div></details>`;
}

function openInfo(kind) {
  const model = kind === 'model';
  $('#dialog-title').textContent = model ? '我们如何计算无限互刷' : '数据来源与研究边界';
  $('#dialog-body').innerHTML = model ? `
    <p>只交替施放 A/B 时，返还必定命中另一技能。这一限定场景由用户游戏实测确认。</p>
    <ol><li>施放 A，给 B 返还 <strong>A 当前等级基础 CD × 30%</strong>。</li><li>实际冷却 = 基础 CD ÷ (1 + 技能急速 ÷ 100)。</li><li>两个方向都能一次清空完整实际 CD，即达到首版的互刷门槛。</li></ol>
    <pre>H ≥ 100 × max(\n  C_A / (0.3 × C_B) − 1,\n  C_B / (0.3 × C_A) − 1\n)</pre><p>普通技能基础 CD 相等时最低为 233⅓。单个充能技能 C 与普通技能 R：枚举 n = 1…当前等级充能上限，要求 n×C/(1+H/100) ≤ 0.3×R 且 R/(1+H/100) ≤ n×0.3×C；取可持续循环的最低门槛。多余返还不能突破储存上限。双充能技能对暂不参与最优排名。</p><p>忽略施法动作、自然冷却、资源消耗、目标要求和额外技能急速。只展示所需技能急速 ≤ 500 的技能对与加点；没有合格结果的英雄也隐藏。船长多层返还由用户实测，其余充能英雄为理论外推。</p>
    <p>并列解使用内部精度判断，完整保留；例如 Q1/W2 与 Q3/W5 若达到同一最低门槛，都应展示。</p>` : `
    <p><strong>数据版本 ${escape(snapshot.patch)}</strong> · 采集日期 ${new Date(snapshot.fetchedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</p>
    <p>中文名称、说明、普通 CD 与图标来自该固定版本的 Riot Data Dragon；图标随站点保存。充能回复时间与逐等级容量重新采集自 Community Dragon 16.21 固定快照。这是客户端数据核验，不是海克斯模式实测。</p>
    <p>技能数据不等于已核实的海克斯大乱斗模式数据。部分形态、重施放、条件重置或属性影响被列为待核验，不参与排名；例外清单并不保证完整。普通结果也是约定模型的理论结果。</p>
    <p>本快照：普通模型 ${snapshot.counts.standard} 个槽位；充能近似 ${snapshot.counts.charge} 个；特殊交互待核验 ${snapshot.counts.review} 个；CD 不足 ${snapshot.counts.missing} 个。</p>
    <p>技能说明采用数据源的基础描述，可能不包含动态数值；逐级 CD 单独展示。首版不自动检查版本或更新数据，不收集对局信息。</p>`;
  $('#info-dialog').showModal();
}

$('#search').addEventListener('input', event => { state.query = event.target.value; renderList(); });
$('#sort').addEventListener('change', event => { state.sort = event.target.value; renderList(); });
for (const [id, key] of [['include-r', 'includeR'], ['include-charges', 'includeCharges']]) {
  $(`#${id}`).addEventListener('change', event => { state[key] = event.target.checked; rebuild(); });
}
$('#champion-list').addEventListener('click', event => {
  const button = event.target.closest('[data-champion]');
  if (button) {
    selectedId = button.dataset.champion; selectedPair = null; chosenCombo = null;
    renderList(); renderDetail();
    if (window.matchMedia('(max-width: 760px)').matches) $('#detail').focus({ preventScroll: false });
    else $(`[data-champion="${selectedId}"]`).focus({ preventScroll: true });
  }
  if (event.target.closest('[data-clear]')) {
    $('#search').value = ''; state.query = ''; renderList(); $('#search').focus();
  }
});
$('#detail').addEventListener('click', event => {
  const pairButton = event.target.closest('[data-pair]');
  if (pairButton) {
    const isTab = pairButton.classList.contains('pair-tab');
    selectedPair = pairButton.dataset.pair; chosenCombo = null; renderDetail();
    $(`${isTab ? '.pair-tab' : '.best-pair-button'}[data-pair="${selectedPair}"]`).focus({ preventScroll: true });
  }
  const rankButton = event.target.closest('[data-ranks]');
  if (rankButton) {
    const [a, b] = rankButton.dataset.ranks.split(',').map(Number);
    chosenCombo = analyses.get(selectedId).pairs.find(p => p.id === selectedPair).combos.find(c => c.rankA === a && c.rankB === b);
    renderDetail();
    const active = $(`[data-ranks="${a},${b}"]`);
    const disclosure = active.closest('details');
    if (disclosure) disclosure.open = true;
    active.focus({ preventScroll: true });
  }
});
$('#detail').addEventListener('change', event => {
  if (!event.target.matches('#rank-a, #rank-b')) return;
  const a = Number($('#rank-a').value), b = Number($('#rank-b').value), id = event.target.id;
  chosenCombo = analyses.get(selectedId).pairs.find(p => p.id === selectedPair).combos.find(c => c.rankA === a && c.rankB === b);
  if (!chosenCombo) chosenCombo = analyses.get(selectedId).pairs.find(p => p.id === selectedPair).combos.find(c => c.rankA === a);
  renderDetail();
  $(`#${id}`).focus({ preventScroll: true });
});
$('#model-open').addEventListener('click', () => { if (snapshot) openInfo('model'); });
$('#sources-open').addEventListener('click', () => { if (snapshot) openInfo('sources'); });
$('#dialog-close').addEventListener('click', () => $('#info-dialog').close());
document.addEventListener('keydown', event => {
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#info-dialog').open) {
    event.preventDefault(); $('#search').focus();
  }
});

try {
  const response = await fetch(new URL('../data/champions.json', import.meta.url));
  if (!response.ok) throw new Error(`数据请求失败：${response.status}`);
  snapshot = await response.json();
  champions = snapshot.champions;
  $('#patch').textContent = `PATCH ${snapshot.patch}`;
  $('#champion-count').textContent = champions.length;
  rebuild();
} catch (error) {
  console.error(error);
  $('#champion-list').innerHTML = '<p class="loading">英雄数据暂时无法加载。</p>';
  $('#detail').innerHTML = '<div class="no-analysis"><h2>研究数据未能加载</h2><p>请通过本地预览或网站地址打开，不要直接双击 HTML 文件。</p><button class="quiet-button" id="retry">重新加载</button></div>';
  $('#retry').addEventListener('click', () => location.reload());
  $('#model-open').disabled = true; $('#sources-open').disabled = true;
}
