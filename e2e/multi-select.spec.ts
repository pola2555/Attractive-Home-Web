import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// A multi-select LEVEL: the seeded "Modular Closet System" has one level marked
// multiple-choice, so the quote shows its modules as checkboxes, several can be
// ticked at once, and each ticked module's price is summed into the line.

const STAMP = Date.now();
const TITLE = `E2E Multi ${STAMP}`;

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    const t = await prisma.configTemplate.findUnique({
      where: { code: 'modular_closet' },
      select: { id: true },
    });
    if (!t) throw new Error('modular_closet not found — run scripts/seed-interior-trees.ts');
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

test('a multi-select level lets several branches be picked and sums them', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Modular Closet System' });
  await page.selectOption('#cfg-variant', 'build_1');

  // The level renders as checkbox chips (not a dropdown), one per module. The
  // checkbox itself is visually hidden inside a styled label, so toggle the chip.
  const chip = (name: string) =>
    page.locator('label').filter({ hasText: name }).first();
  // A dropdown for this question would be #cfg-mc_module — assert it is NOT one.
  await expect(page.locator('#cfg-mc_module')).toHaveCount(0);
  await expect(chip('Shoe rack')).toBeVisible();

  // Shoe rack (90) + Drawer tower (140) = 230.
  await chip('Shoe rack').click();
  await chip('Drawer tower').click();
  await expect(page.getByText('USD 230.00').first()).toBeVisible();

  // + Glass cabinet (180) = 410.
  await chip('Glass cabinet').click();
  await expect(page.getByText('USD 410.00').first()).toBeVisible();

  // Untick Drawer tower → 90 + 180 = 270.
  await chip('Drawer tower').click();
  await expect(page.getByText('USD 270.00').first()).toBeVisible();
  await shot(page, 'multi-select-01');

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Add to quote' }).click(),
  ]);
  // The line records the picked modules.
  await expect(page.locator('tr', { hasText: 'Shoe rack' }).first()).toBeVisible({ timeout: 30_000 });

  // The cart shows a Total from the per-line costs (shipment/landed is off).
  await expect(page.locator('tfoot')).toContainText('Total');
  await expect(page.locator('tfoot')).toContainText('USD 270.00');

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Multi ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
