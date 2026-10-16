import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The five seeded interior-design tree products price from their base decision
// tree, and their flat canvas add-ons add on top. Spot-checks two of them in a
// quote, and loads one canvas.

const STAMP = Date.now();
const TITLE = `E2E Interior ${STAMP}`;
let cabinetProductId = '';

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    const p = await prisma.product.findUnique({
      where: { slug: 'kitchen-cabinet' },
      select: { id: true },
    });
    if (!p) throw new Error('kitchen-cabinet product not found — run scripts/seed-interior-trees.ts');
    cabinetProductId = p.id;
  } finally {
    await prisma.$disconnect();
  }
});

async function openQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('a Kitchen Cabinet prices from its tree, and an add-on stacks', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Kitchen Cabinet' });
  await page.selectOption('#cfg-variant', 'build_1');
  // The base build shows its gallery, straight from the canvas (a web image).
  await expect(page.locator('img[src*="pexels.com/photos/6283970"]').first()).toBeVisible();
  // material opens first; finish opens after it (tree-driven).
  await expect(page.locator('#cfg-kc_finish')).toHaveCount(0);
  await page.selectOption('#cfg-kc_material', 'mdf');
  await page.selectOption('#cfg-kc_finish', 'laminate');
  await expect(page.getByText('USD 120.00').first()).toBeVisible(); // base mdf+laminate

  // Oak + lacquer = 240 + 55 = 295.
  await page.selectOption('#cfg-kc_material', 'oak');
  await page.selectOption('#cfg-kc_finish', 'lacquer');
  await expect(page.getByText('USD 295.00').first()).toBeVisible();
  // The chosen material shows its own image beside the question (Oak → its node).
  await expect(page.locator('img[src*="pexels.com/photos/6538903"]').first()).toBeVisible();

  // A flat canvas add-on stacks on top (+25).
  await page.getByLabel('Soft-close hinges').check();
  await expect(page.getByText('USD 320.00').first()).toBeVisible();
  await shot(page, 'interior-cabinet-01');

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Add to quote' }).click(),
  ]);
  await expect(page.locator('tr', { hasText: 'Soft-close hinges' }).first()).toBeVisible({
    timeout: 30_000,
  });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a Bathroom Vanity prices a different branch', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Bathroom Vanity' });
  await page.selectOption('#cfg-variant', 'build_1');
  await page.selectOption('#cfg-bv_top', 'marble');
  await page.selectOption('#cfg-bv_basin', 'double');
  await expect(page.getByText('USD 460.00').first()).toBeVisible(); // 340 + 120
});

test('the Kitchen Cabinet canvas loads', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await page.goto(`/dashboard/products/${cabinetProductId}/tree`);
  await page.waitForSelector('svg', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Open all' }).click();
  await page.getByRole('button', { name: 'Fit' }).click();
  // The base ("owner") node's panel offers the base-image editor and shows the
  // saved gallery thumbnail, straight from the canvas data.
  await expect(page.getByText('Base images (optional)')).toBeVisible();
  await expect(page.locator('img[src*="pexels.com/photos/6283970"]').first()).toBeVisible();
  await shot(page, 'interior-cabinet-canvas');
  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Interior ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
