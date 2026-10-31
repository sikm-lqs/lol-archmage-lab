import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#champion-count')).toHaveText('173');
});

test('loads real icons and explains the selected optimal pair without runtime or network errors', async ({ page }) => {
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) issues.push(response.url()); });
  await page.reload();
  await expect(page.locator('.big-number')).toContainText('233⅓');
  await expect(page.locator('.summary-main')).toContainText('234');
  await expect(page.locator('.proof-row')).toHaveCount(2);
  await expect(page.locator('.game-icon').first()).toBeVisible();
  await page.getByRole('button', { name: '计算模型' }).click();
  await expect(page.getByRole('dialog')).toContainText('233⅓');
  await page.getByRole('button', { name: '关闭说明' }).click();
  expect(issues).toEqual([]);
});

test('searches Chinese, title and English; empty results can be cleared', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: '搜索英雄' });
  for (const query of ['安妮', '黑暗之女', 'aNNie']) {
    await search.fill(query);
    await expect(page.locator('.champion-row')).toHaveCount(1);
  }
  await page.locator('.champion-row').click();
  await expect(page.locator('.champion-heading h2')).toContainText('黑暗之女');
  await search.fill('不存在的英雄000');
  await expect(page.locator('.empty')).toBeVisible();
  await page.getByRole('button', { name: '清空搜索' }).click();
  await expect(page.locator('.champion-row')).toHaveCount(152);
});

test('preserves all tied ranks and lets users explore a non-optimal combination', async ({ page }) => {
  await page.getByRole('searchbox').fill('Annie');
  await page.locator('.champion-row').click();
  const bestCount = Number((await page.locator('.combo-heading strong').textContent()).match(/\d+/)[0]);
  expect(bestCount).toBeGreaterThan(6);
  await page.locator('.more-combos summary').click();
  await expect(page.locator('.optimal-combos [data-ranks]')).toHaveCount(bestCount);
  await page.locator('.optimal-combos [data-ranks]').last().click();
  await expect(page.locator('.more-combos')).toHaveAttribute('open', '');
  await expect(page.locator('.combo-tag.active')).toBeFocused();
  await expect(page.locator('.pair-tab[data-pair="Q+R"]')).toHaveCount(0);
  await page.locator('#rank-a').selectOption('1');
  await page.locator('#rank-b').selectOption('3');
  await expect(page.locator('.selection-result')).toContainText('急速');
});

test('changing ranks updates both cooldowns and threshold', async ({ page }) => {
  const before = await page.locator('.selection-result').textContent();
  await page.locator('#rank-a').selectOption('5');
  await expect(page.locator('.selection-result')).not.toHaveText(before);
  await expect(page.locator('.selection-result')).toContainText('非最优搭配');
  await expect(page.locator('#rank-a')).toBeFocused();
});

test('R and charge filters change eligibility; charged skills are explicitly marked', async ({ page }) => {
  await expect(page.locator('.pair-tab')).toHaveCount(3);
  await page.getByLabel('包含 R', { exact: true }).uncheck();
  await expect(page.locator('.pair-tab')).toHaveCount(3);
  await page.getByLabel('包含 R', { exact: true }).check();
  await page.getByRole('searchbox').fill('Teemo');
  await page.locator('.champion-row').click();
  await page.locator('.pair-tab[data-pair="W+R"]').click();
  await expect(page.locator('.research-title')).toContainText('充能循环');
  await page.getByLabel('充能估算', { exact: true }).uncheck();
  await expect(page.locator('.champion-row')).toHaveCount(0);
});

test('skill descriptions expand and show rank CDs; heroes without eligible results are hidden', async ({ page }) => {
  await page.locator('.skill-entry summary').first().click();
  await expect(page.locator('.skill-content').first()).toBeVisible();
  await expect(page.locator('.rank-cd-list').first().locator('> div')).toHaveCount(5);
  await page.getByRole('searchbox').fill('Hwei');
  await expect(page.locator('.champion-row')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('≤ 500');
  await page.getByRole('button', { name: '数据来源与局限' }).click();
  await expect(page.getByRole('dialog')).toContainText('不等于已核实');
});

test('keyboard search shortcut and dialog Escape work', async ({ page }) => {
  await page.locator('body').click({ position: { x: 10, y: 100 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('button', { name: '计算模型' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '计算模型' })).toBeFocused();
});

test('data load failure gives an actionable error and supports retry', async ({ page }) => {
  await page.route('**/data/champions.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.reload();
  await expect(page.locator('.no-analysis')).toContainText('研究数据未能加载');
  await page.unroute('**/data/champions.json');
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.locator('#champion-count')).toHaveText('173');
});

test('built site works under a GitHub Pages repository subpath without external requests', async ({ page }) => {
  const external = [];
  const errors = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5181/')) external.push(request.url());
  });
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto('http://127.0.0.1:5181/lol-archmage/');
  await expect(page.locator('#champion-count')).toHaveText('173');
  await page.getByRole('searchbox').fill('Teemo');
  await page.locator('.champion-row').click();
  await expect(page.locator('.champion-heading h2')).toContainText('迅捷斥候');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`responsive layout at ${width}px does not overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.refund-proof')).toBeVisible();
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, body: document.body.scrollWidth, doc: document.documentElement.scrollWidth,
    }));
    expect(layout.body).toBeLessThanOrEqual(layout.viewport);
    expect(layout.doc).toBeLessThanOrEqual(layout.viewport);
    await page.locator('.skill-entry summary').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await mkdir('artifacts', { recursive: true });
    await page.locator('.topbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/preview-${width}.png`, fullPage: true });
    if (width === 1440) await page.screenshot({ path: 'artifacts/preview-desktop.png' });
  });
}


test('charge model shows rank capacity and sustained batches; GP ER grace retained, Ashe equal-CD case retained', async ({ page }) => {
  await page.getByRole('searchbox').fill('Gangplank');
  await page.locator('.champion-row').click();
  await expect(page.locator('.pair-tab[data-pair="E+R"]')).toContainText('R 等');
  await page.locator('.skill-entry').nth(2).locator('summary').click();
  await expect(page.locator('.skill-entry').nth(2)).toContainText('5 级 · 5 层');
  await page.getByRole('searchbox').fill('Ashe');
  await page.locator('.champion-row').click();
  await page.locator('[data-ranks="4,3"]').click();
  await expect(page.locator('.selection-result')).toContainText('233⅓');
  await expect(page.locator('.refund-proof')).toContainText('E × 1 ↔ R × 1');
  await expect(page.locator('.refund-proof')).toContainText('仍待实测');
  await page.getByRole('searchbox').fill('Caitlyn');
  await page.locator('.champion-row').click();
  await page.locator('.pair-tab[data-pair="W+R"]').click();
  await expect(page.locator('.refund-proof')).toContainText('W × 3 ↔ R × 1');
  await page.screenshot({ path: 'artifacts/preview-charge.png', fullPage: true });
});


for (const width of [320, 390, 1440]) {
  test(`R grace: GP ER is honestly labelled, selectable and within ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({width, height:1000});
    await page.getByRole('searchbox').fill('Gangplank');
    await page.locator('.champion-row').click();
    await page.locator('.pair-tab[data-pair="E+R"]').click();
    await expect(page.locator('.combo-tag.active')).toHaveText('E5 + R3');
    await expect(page.locator('.near-notice')).toContainText('500 急速下近似循环，R 仍需等待 0.5 秒');
    await expect(page.locator('.research-title')).toContainText('非无缝');
    await expect(page.locator('.proof-row').first()).toContainText('R 仍需等待 0.5 秒');
    await expect(page.locator('.proof-row').first()).not.toContainText('✓');
    await expect(page.locator('.proof-row').last()).toContainText('✓');
    await expect(page.locator('.research-footnote')).not.toContainText('整数急速至少');
    await expect(page.locator('#rank-a option[value="2"]')).toHaveCount(0);
    await page.locator('#rank-b').selectOption('2');
    await expect(page.locator('.near-notice')).toContainText('3.83 秒');
    await page.locator('#rank-a').selectOption('1');
    await expect(page.locator('#rank-b')).toHaveValue('3');
    await expect(page.locator('.near-notice')).toContainText('4.7 秒');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`artifacts/preview-r-grace-${width}.png`,fullPage:true});
    await page.getByLabel('包含 R', {exact:true}).uncheck();
    await expect(page.locator('.pair-tab[data-pair="E+R"]')).toHaveCount(0);
    await expect(page.locator('.near-notice')).toHaveCount(0);
  });
}
test('R grace: near-only heroes never claim a minimum seamless threshold', async ({ page }) => {
  await page.getByRole('searchbox').fill('Veigar');
  await expect(page.locator('.champion-row')).toContainText('R 等');
  await page.locator('.champion-row').click();
  await expect(page.locator('.summary-main')).toContainText('固定 500 急速');
  await expect(page.locator('.summary-main')).not.toContainText('整数急速至少');
  await expect(page.locator('.near-notice')).toContainText('不是无缝互刷');
  await page.getByRole('button', {name:'计算模型'}).click();
  await expect(page.getByRole('dialog')).toContainText('R 剩余冷却 ≤ 5 秒');
});
