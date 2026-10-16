import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// Drives the ACCESSORY feature the way a user does: open the Accessories tab,
// create a per-item accessory and a bulk one through the modal (incl. the scope
// confirm step), then attach one to the product node as a canvas node. Works on a
// throwaway clone ("E2E Acc …") so real data is untouched, and deletes the clone
// (which cascade-removes its private accessories) in afterAll.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const THROWAWAY = `E2E Acc ${STAMP}`;
const PREFIX = 'E2E Acc ';

const accChips = (page: Page) => page.locator('.pal-chip.acc');
const accNodes = (page: Page) => page.locator('svg.cv .gnode[data-id^="acc:"]');

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragChipTo(page: Page, chipText: string, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ label, x, y }) => {
      const chips = [...document.querySelectorAll('.pal-chip.acc')] as HTMLElement[];
      const src = chips.find((c) => (c.textContent ?? '').includes(label));
      if (!src) throw new Error(`accessory chip not found: ${label}`);
      const dt = new DataTransfer();
      const fire = (el: Element, type: string, extra: Record<string, unknown> = {}) =>
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...extra }));
      fire(src, 'dragstart');
      const target = document.elementFromPoint(x, y) ?? document.querySelector('.stage')!;
      fire(target, 'dragenter', { clientX: x, clientY: y });
      fire(target, 'dragover', { clientX: x, clientY: y });
      fire(target, 'drop', { clientX: x, clientY: y });
      fire(src, 'dragend');
    },
    { label: chipText, x, y },
  );
}

test('create per-item + bulk accessories, then attach one as a node', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectConsoleErrors(page);
  page.on('dialog', (d) => {
    errors.push(`NATIVE DIALOG (should never happen): ${d.message()}`);
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
    os.map((o) => ({ v: (o as HTMLOptionElement).value, t: (o.textContent ?? '').trim() })).filter((e) => e.v),
  );
  test.skip(srcEntries.length === 0, 'no copy source available');
  const source = srcEntries.find((e) => /benison|door/i.test(e.t)) ?? srcEntries[0];
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

  // ── open the Accessories tab ─────────────────────────────────────────────────
  await page.locator('.pal-tabs button', { hasText: 'Accessories' }).click();
  expect(await accChips(page).count()).toBe(0);

  // ── create a PER-ITEM accessory through the modal (+ confirm step) ───────────
  const lockName = `${THROWAWAY} Lever lock`;
  await page.getByRole('button', { name: /New accessory/i }).click();
  await expect(page.locator('.acc-modal')).toBeVisible();
  await page.locator('.acc-modal input').first().fill(lockName); // Name is the first input
  await page.locator('.acc-mode', { hasText: 'Per item' }).click();
  await page.locator('.acc-modal .price-in').fill('22');
  await page.getByRole('button', { name: /Create accessory/i }).click();
  // confirm step states the scope + product name, then Confirm commits
  await expect(page.locator('.acc-confirm-q')).toContainText(THROWAWAY);
  await page.getByRole('button', { name: /^Confirm$/ }).click();
  await expect(page.locator('.acc-modal')).toBeHidden({ timeout: 20_000 });
  await page.locator('.pal-tabs button', { hasText: 'Accessories' }).click();
  await expect(accChips(page).filter({ hasText: 'Lever lock' })).toHaveCount(1, { timeout: 15_000 });
  await shot(page, 'acc-01-per-item-created');

  // ── create a BULK accessory (price breaks) ───────────────────────────────────
  const pamphletName = `${THROWAWAY} Pamphlet`;
  await page.getByRole('button', { name: /New accessory/i }).click();
  await expect(page.locator('.acc-modal')).toBeVisible();
  await page.locator('.acc-modal input').first().fill(pamphletName);
  await page.locator('.acc-mode', { hasText: 'Bulk' }).click();
  // first tier row
  const tier0 = page.locator('.acc-tier').nth(0);
  await tier0.locator('input').nth(0).fill('1');
  await tier0.locator('input').nth(1).fill('30');
  await page.getByRole('button', { name: /add tier/i }).click();
  const tier1 = page.locator('.acc-tier').nth(1);
  await tier1.locator('input').nth(0).fill('100');
  await tier1.locator('input').nth(1).fill('15');
  await page.getByRole('button', { name: /Create accessory/i }).click();
  await page.getByRole('button', { name: /^Confirm$/ }).click();
  await expect(page.locator('.acc-modal')).toBeHidden({ timeout: 20_000 });
  await page.locator('.pal-tabs button', { hasText: 'Accessories' }).click();
  await expect(accChips(page).filter({ hasText: 'Pamphlet' })).toHaveCount(1, { timeout: 15_000 });

  // ── attach the lock to the product node → it becomes a canvas node ───────────
  const before = await accNodes(page).count();
  const door = await centerOf(page, 'svg.cv .gnode[data-id="door"]');
  await dragChipTo(page, 'Lever lock', door.x, door.y);
  await page.waitForTimeout(1500);
  await page.locator('.pal-tabs button', { hasText: 'Accessories' }).click();
  await expect(accNodes(page)).toHaveCount(before + 1, { timeout: 15_000 });
  await shot(page, 'acc-02-attached-node');

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    // Private accessories cascade with the product; delete any stragglers by name too.
    await prisma.accessory.deleteMany({ where: { name: { startsWith: PREFIX } } });
    const products = await prisma.product.findMany({
      where: { translations: { some: { name: { startsWith: PREFIX } } } },
      select: { id: true, templateId: true },
    });
    const templateIds = products.map((p) => p.templateId).filter((x): x is string => Boolean(x));
    if (products.length) await prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
    if (templateIds.length) await prisma.configTemplate.deleteMany({ where: { id: { in: templateIds } } });
    console.log(`CLEANUP removed ${products.length} throwaway product(s), ${templateIds.length} template(s)`);
  } finally {
    await prisma.$disconnect();
  }
});
