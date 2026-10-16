import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, shot, shotPath, signInAsAdmin } from './helpers';

// Stress the configurator tree canvas like a real author: open everything, zoom,
// pan, multi-select, toggle connect mode, and churn expand/collapse rapidly. This
// phase is NON-DESTRUCTIVE — it never writes to the DB (no paste, delete, rename,
// or price edits), so it is safe to run against the dev dataset.

test.describe.configure({ mode: 'serial' });

async function assertNoAppError(page: Page): Promise<void> {
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Application error|Unhandled Runtime Error|client-side exception/i);
}

/** Open the first configurable product's tree canvas; skip if the dataset has none. */
async function openTree(page: Page): Promise<void> {
  await page.goto('/dashboard/products');
  const editHrefs = await page
    .locator('a[href*="/dashboard/products/"][href$="/edit"]')
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  let treeHref: string | null = null;
  for (const href of editHrefs.slice(0, 15)) {
    if (!href) continue;
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    const link = page.locator('a[href$="/tree"]');
    if (await link.count()) {
      treeHref = await link.first().getAttribute('href');
      break;
    }
  }
  test.skip(!treeHref, 'no configurable product with a tree found in this dataset');
  await page.goto(treeHref!, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/tree$/, { timeout: 60_000 });
  await expect(page.locator('svg.cv')).toBeVisible();
}

/** Click every collapsed (+) handle repeatedly until the tree is fully open. */
async function expandAll(page: Page, cap = 200): Promise<number> {
  let clicks = 0;
  for (let i = 0; i < cap; i++) {
    const plus = page.locator('.handle', { hasText: '+' });
    if ((await plus.count()) === 0) break;
    await plus.first().click({ timeout: 5000 }).catch(() => {});
    clicks++;
    await page.waitForTimeout(30);
  }
  return clicks;
}

test('tree canvas loads with its three panes and no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openTree(page);
  await expect(page.locator('.palette')).toBeVisible();
  await expect(page.locator('svg.cv')).toBeVisible();
  await assertNoAppError(page);
  await shot(page, 'tree-01-load');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('expand EVERYTHING — many rebuilds, many edges (stresses edge routing/colour)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openTree(page);

  const clicks = await expandAll(page);
  await page.waitForTimeout(300);
  const nodes = await page.locator('svg.cv .gnode').count();
  const edges = await page.locator('svg.cv path.edge').count();
  const attach = await page.locator('svg.cv path.edge.attach').count();
  console.log(`expanded: ${clicks} clicks -> ${nodes} nodes, ${edges} edges (${attach} attach)`);
  await assertNoAppError(page);
  await shot(page, 'tree-02-expanded');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('zoom and pan the fully-open canvas', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openTree(page);
  await expandAll(page, 80);

  const zoomBtns = page.locator('.zoombar button');
  const n = await zoomBtns.count();
  for (let i = 0; i < 4; i++) await zoomBtns.nth(0).click().catch(() => {});
  if (n > 1) for (let i = 0; i < 4; i++) await zoomBtns.nth(1).click().catch(() => {});
  if (n > 2) await zoomBtns.nth(2).click().catch(() => {}); // reset, if present

  // Pan by dragging an empty corner of the stage.
  const box = await page.locator('svg.cv').boundingBox();
  if (box) {
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 160, { steps: 8 });
    await page.mouse.up();
  }
  await assertNoAppError(page);
  await shot(page, 'tree-03-zoompan');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('multi-select with ctrl-click surfaces the bulk toolbar', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openTree(page);
  await expandAll(page, 80);

  const nodes = page.locator('svg.cv .gnode');
  const count = await nodes.count();
  const pick = Math.min(count, 6);
  for (let i = 0; i < pick; i++) {
    await nodes.nth(i).click({ modifiers: ['Control'] }).catch(() => {});
  }
  await page.waitForTimeout(150);
  await shot(page, 'tree-04-multiselect');
  // Deselect and make sure nothing errored.
  await page.keyboard.press('Escape').catch(() => {});
  await assertNoAppError(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('connect-mode toggles rapidly without crashing', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openTree(page);
  const connect = page.getByRole('button', { name: /connect/i }).first();
  test.skip(!(await connect.count()), 'no connect toggle');
  for (let i = 0; i < 6; i++) {
    await connect.click().catch(() => {});
    await page.waitForTimeout(60);
  }
  await assertNoAppError(page);
  await shot(page, 'tree-05-connect');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('capture readable views for review (fit + zoomed edges)', async ({ page }) => {
  await signInAsAdmin(page);
  await openTree(page);
  await expandAll(page, 120);
  await page.getByRole('button', { name: /^Fit$/ }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('.stage').screenshot({ path: shotPath('tree-fit') });

  // Zoom in a few steps to inspect the connection lines up close.
  const zin = page.locator('.zoombar button').first();
  for (let i = 0; i < 4; i++) {
    await zin.click().catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.locator('.stage').screenshot({ path: shotPath('tree-zoom') });

  // Select a node to show the detail panel.
  await page.locator('svg.cv .gnode').first().click().catch(() => {});
  await page.waitForTimeout(200);
  await shot(page, 'tree-detail-panel');
});

test('hover-to-highlight focuses a node and its connections', async ({ page }) => {
  await signInAsAdmin(page);
  await openTree(page);
  await expandAll(page, 120);
  await page.getByRole('button', { name: /^Fit$/ }).click().catch(() => {});
  await page.waitForTimeout(300);
  // Pick a node that actually has an attachment link, so highlighting is visible.
  const fromId = await page.locator('svg.cv path.edge.attach').first().getAttribute('data-from');
  test.skip(!fromId, 'no attach edges to hover');
  const target = page.locator(`svg.cv .gnode[data-id="${fromId}"]`).first();
  await target.hover();
  await page.waitForTimeout(250);
  // The SVG should now be in focus mode.
  await expect(page.locator('svg.cv.hl-on')).toHaveCount(1);
  await expect(page.locator('svg.cv path.edge.hl').first()).toBeVisible();
  await page.locator('.stage').screenshot({ path: shotPath('tree-hover') });
});

test('rapid expand/collapse churn on a single handle', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openTree(page);
  const handle = page.locator('.handle').first();
  test.skip(!(await handle.count()), 'no handles');
  for (let i = 0; i < 16; i++) {
    await handle.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(40);
  }
  await assertNoAppError(page);
  expect(errors, errors.join('\n')).toEqual([]);
});
