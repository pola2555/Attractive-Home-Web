import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// DIAGNOSTIC: drive the tree canvas the way a user does — drag a colour node out of
// the palette, undo/redo it, drag an existing colour node onto a branch to connect
// it — and report what actually happens. It CLONES an existing tree into a throwaway
// ("E2E Tree Diag …") so real data is never touched, and deletes the clone (product
// + its cloned template) in afterAll.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const THROWAWAY = `E2E Tree Diag ${STAMP}`;
const PREFIX = 'E2E Tree Diag ';

const addonCount = (page: Page) => page.locator('svg.cv .gnode[data-id^="ad:"]').count();
const attachEdges = (page: Page) => page.locator('svg.cv path.edge.attach').count();

// Fire a full HTML5 drag sequence from a palette chip (found by its text) to a point
// on the canvas, carrying one DataTransfer through so the app's drop handler reads it.
async function dragChipTo(page: Page, chipLabel: string, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ label, x, y }) => {
      const chips = [...document.querySelectorAll('.pal-chip')] as HTMLElement[];
      const src = chips.find((c) => (c.textContent ?? '').includes(label));
      if (!src) throw new Error(`palette chip not found: ${label}`);
      const dt = new DataTransfer();
      const fire = (el: Element, type: string, extra: Record<string, unknown> = {}) =>
        el.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...extra }),
        );
      fire(src, 'dragstart');
      const target = document.elementFromPoint(x, y) ?? document.querySelector('.stage')!;
      fire(target, 'dragenter', { clientX: x, clientY: y });
      fire(target, 'dragover', { clientX: x, clientY: y });
      fire(target, 'drop', { clientX: x, clientY: y });
      fire(src, 'dragend');
    },
    { label: chipLabel, x, y },
  );
}

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('drag a colour node, undo/redo it, connect it — report what happens', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectConsoleErrors(page);
  page.on('dialog', (d) => {
    errors.push(`NATIVE DIALOG (possible XSS): ${d.message()}`);
    d.dismiss().catch(() => {});
  });

  await signInAsAdmin(page);

  // ── clone an existing tree into a throwaway ──────────────────────────────────
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
    page.waitForURL(/\/dashboard\/products\/[^/]+\/tree$/, { timeout: 90_000 }).catch(() => {}),
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
  await page.waitForTimeout(500);

  const report: Record<string, unknown> = { source: source.t, throwaway: THROWAWAY };

  // ── 1. Create a colour node by dropping the palette chip on the product node ──
  const before = await addonCount(page);
  const baseBox = await centerOf(page, 'svg.cv .gnode[data-id="door"]');
  await dragChipTo(page, 'Colour node', baseBox.x, baseBox.y);
  await page.waitForTimeout(1200);
  const afterCreate = await addonCount(page);
  report.colourNode_create = { before, afterCreate, created: afterCreate > before };
  await shot(page, 'diag-01-colour-created');

  // ── 2. Undo the colour-node creation (the reported bug) ──────────────────────
  const undo = page.getByRole('button', { name: /Undo/i }).first();
  report.undo_enabled_after_create = (await undo.count()) > 0 && (await undo.isEnabled());
  if (report.undo_enabled_after_create) {
    await undo.click();
    await page.waitForTimeout(1200);
    const afterUndo = await addonCount(page);
    report.colourNode_undo = { afterUndo, removed: afterUndo < afterCreate };
    await shot(page, 'diag-02-after-undo');

    // ── 3. Redo it ─────────────────────────────────────────────────────────────
    const redo = page.getByRole('button', { name: /Redo/i }).first();
    report.redo_enabled_after_undo = (await redo.count()) > 0 && (await redo.isEnabled());
    if (report.redo_enabled_after_undo) {
      await redo.click();
      await page.waitForTimeout(1200);
      const afterRedo = await addonCount(page);
      report.colourNode_redo = { afterRedo, restored: afterRedo > afterUndo };
      await shot(page, 'diag-03-after-redo');
    }
  }

  // ── 4. Connect an existing colour node to a base branch by dragging its chip ──
  // Open the base tree first so a branch is on the canvas.
  const firstBranch = page.locator('svg.cv .gnode[data-id^="pn:"]').first();
  if (await firstBranch.count()) {
    const attachBefore = await attachEdges(page);
    const branch = await centerOf(page, 'svg.cv .gnode[data-id^="pn:"]');
    // The palette lists existing add-ons/colours under "Your add-ons & colours".
    const paletteAddon = page.locator('.pal-sec', { hasText: 'Your add-ons' }).locator('.pal-chip');
    report.palette_lists_existing_addons = await paletteAddon.count();
    if (await paletteAddon.count()) {
      const label = (await paletteAddon.first().innerText()).trim();
      await dragChipTo(page, label, branch.x, branch.y);
      await page.waitForTimeout(1200);
      const attachAfter = await attachEdges(page);
      report.connect_existing = { label, attachBefore, attachAfter, connected: attachAfter > attachBefore };
      await shot(page, 'diag-04-after-connect');

      // ── 5. Undo the connect — the attachment should disappear (now versioned) ──
      if (attachAfter > attachBefore) {
        const undo2 = page.getByRole('button', { name: /Undo/i }).first();
        if ((await undo2.count()) && (await undo2.isEnabled())) {
          await undo2.click();
          await page.waitForTimeout(1200);
          const attachAfterUndo = await attachEdges(page);
          report.connect_undo = { attachAfterUndo, removed: attachAfterUndo < attachAfter };
          await shot(page, 'diag-05-after-connect-undo');
        }
      }
    }
  }

  report.console_errors = errors;
  console.log('DIAGNOSTIC_REPORT=' + JSON.stringify(report, null, 2));

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      where: { translations: { some: { name: { startsWith: PREFIX } } } },
      select: { id: true, templateId: true },
    });
    const templateIds = products.map((p) => p.templateId).filter((x): x is string => Boolean(x));
    if (products.length) await prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
    if (templateIds.length)
      await prisma.configTemplate.deleteMany({ where: { id: { in: templateIds } } });
    console.log(`CLEANUP removed ${products.length} throwaway product(s), ${templateIds.length} template(s)`);
  } finally {
    await prisma.$disconnect();
  }
});
