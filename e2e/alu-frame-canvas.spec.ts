import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The Aluminum Frame tree canvas must show the add-on layer (All same colour,
// Nano, Glass opening, Size upgrades…) and the colour nodes, not just the bare
// base price tree. Loads the canvas and captures it; the product is permanent.

let productId = '';

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    const p = await prisma.product.findUnique({ where: { slug: 'aluminum-frame-door' }, select: { id: true } });
    if (!p) throw new Error('aluminum-frame-door product not found');
    productId = p.id;
  } finally {
    await prisma.$disconnect();
  }
});

test('the Aluminum Frame canvas shows the add-ons and colour nodes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);

  await page.goto(`/dashboard/products/${productId}/tree`);
  await page.waitForSelector('svg', { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await shot(page, 'alu-canvas-01');

  // Expand every group so all the add-on / colour connections are drawn at once —
  // the crowded state where the edge casing has to keep crossings legible.
  await page.getByRole('button', { name: 'Open all' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(600);
  // Zoom into the crowded middle so the crossings (and the casing) are visible.
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'alu-canvas-02-expanded');

  expect(errors, errors.join('\n')).toEqual([]);
});
