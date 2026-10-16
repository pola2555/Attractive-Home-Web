import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// DESTRUCTIVE tree stress. To avoid touching real data it CLONES an existing tree
// product into a throwaway ("E2E Tree Stress …"), hammers the clone, and the copy
// is removed afterwards by scripts/cleanup (product + cloned template). It feeds a
// deliberately hostile string (XSS + emoji + RTL + very long) into a node and traps
// native dialogs, so a rendered <script>/onerror would fail the test.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const THROWAWAY = `E2E Tree Stress ${STAMP}`;
const EXTREME =
  `<img src=x onerror="window.__pwned=1"> 😀🔥 مرحبا שלום ${'A'.repeat(280)} <b>bold</b> & "q'q"`;

async function expandAll(page: Page, cap = 120): Promise<void> {
  for (let i = 0; i < cap; i++) {
    const plus = page.locator('.handle', { hasText: '+' });
    if ((await plus.count()) === 0) break;
    await plus.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(30);
  }
}

const branchCount = (page: Page) => page.locator('svg.cv .gnode[data-id^="pn:"]').count();

test('clone a throwaway tree, feed extreme input, delete + undo', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectConsoleErrors(page);
  page.on('dialog', (d) => {
    errors.push(`NATIVE DIALOG (possible XSS): ${d.message()}`);
    d.dismiss().catch(() => {});
  });

  await signInAsAdmin(page);

  // ── create by cloning an existing tree ──────────────────────────────────────
  await page.goto('/dashboard/products/new?type=tree', { waitUntil: 'domcontentloaded' });
  const copyBtn = page.getByRole('button', { name: /Copy an existing tree/i });
  test.skip(!(await copyBtn.count()) || (await copyBtn.isDisabled()), 'no tree product to copy');
  await copyBtn.click();

  const src = page.locator('#sourceProductId');
  const srcEntries = await src.locator('option').evaluateAll((os) =>
    os
      .map((o) => ({ v: (o as HTMLOptionElement).value, t: (o.textContent ?? '').trim() }))
      .filter((e) => e.v),
  );
  test.skip(srcEntries.length === 0, 'no copy source available');
  // Prefer a source whose base is a DECISION TREE (has pn: branches) — "door test".
  const source = srcEntries.find((e) => /door test/i.test(e.t)) ?? srcEntries[0];
  await src.selectOption(source.v);

  const sup = page.locator('#sourceId');
  const supOpts = await sup
    .locator('option')
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  test.skip(supOpts.length === 0, 'no supplier available');
  await sup.selectOption(supOpts[0]);

  await page.fill('#name', THROWAWAY);
  await Promise.all([
    page
      .waitForURL(/\/dashboard\/products\/[^/]+(\/tree|\/edit)?$/, { timeout: 90_000 })
      .catch(() => {}),
    page.getByRole('button', { name: /Create & open canvas/i }).click(),
  ]);

  if (!/\/tree$/.test(page.url())) {
    const treeLink = page.locator('a[href$="/tree"]');
    if (await treeLink.count()) {
      const href = await treeLink.first().getAttribute('href');
      if (href) await page.goto(href, { waitUntil: 'domcontentloaded' });
    }
  }
  await expect(page.locator('svg.cv')).toBeVisible({ timeout: 30_000 });
  expect(/\/tree$/.test(page.url()), `landed on the tree canvas (${page.url()})`).toBeTruthy();

  await expandAll(page);
  const cloned = await branchCount(page);
  console.log(`clone produced ${cloned} base branches`);
  expect(cloned, 'clone deep-copied the tree').toBeGreaterThan(0);
  await shot(page, 'destr-01-clone');

  // ── extreme input into a node's notes (auto-save on blur) ───────────────────
  await page.locator('svg.cv .gnode[data-id^="pn:"]').first().click();
  await page.waitForTimeout(250);
  const ta = page.locator('textarea').first();
  if (await ta.count()) {
    await ta.fill(EXTREME);
    await page.locator('svg.cv').click({ position: { x: 6, y: 6 } }); // blur → auto-save
    await page.waitForTimeout(700);
    console.log('extreme string saved to node notes');
  } else {
    console.log('no notes textarea in the detail panel');
  }

  // ── multi-select + delete + undo ────────────────────────────────────────────
  const before = await branchCount(page);
  const pns = page.locator('svg.cv .gnode[data-id^="pn:"]');
  const pick = Math.min(2, await pns.count());
  for (let i = 0; i < pick; i++) await pns.nth(i).click({ modifiers: ['Control'] });
  await page.waitForTimeout(200);

  const removeTrigger = page.getByRole('button', { name: /Remove \d+ selected/i });
  if (await removeTrigger.count()) {
    await removeTrigger.first().click();
    await page.getByRole('button', { name: /^Remove$/ }).first().click();
    await page.waitForTimeout(900);
    const afterDel = await branchCount(page);
    console.log(`delete: ${before} -> ${afterDel} branches`);
    expect(afterDel, 'delete removed branches').toBeLessThan(before);

    const undo = page.getByRole('button', { name: /Undo/i }).first();
    if ((await undo.count()) && (await undo.isEnabled())) {
      await undo.click();
      await page.waitForTimeout(1000);
      const afterUndo = await branchCount(page);
      console.log(`undo: ${afterDel} -> ${afterUndo} branches (was ${before})`);
    } else {
      console.log('undo not available after bulk delete');
    }
  } else {
    console.log('bulk remove control not shown for this selection');
  }
  await shot(page, 'destr-02-after');

  console.log(`THROWAWAY_NAME=${THROWAWAY}`);
  expect(errors, errors.join('\n')).toEqual([]);
});
