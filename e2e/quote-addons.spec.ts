import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// Phase 2a: the flat upgrades (All same colour, craftsmanship, Flat outside) are
// now priced straight from the canvas add-ons, not the retired ConfigUpgrade
// rows. They appear in the "Add-ons" section and are offered only on the
// branches their canvas node is attached to.

const STAMP = Date.now();
const QUOTE_TITLE = `E2E Addons ${STAMP}`;

async function openQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('flat add-ons price straight from the canvas', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Aluminum Frame Door' });
  await page.selectOption('#cfg-variant', 'alu_wpc');
  await page.selectOption('#cfg-ben_thickness', '45');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'wpc');
  await expect(page.getByText('USD 90.00').first()).toBeVisible();

  // The "All same colour" add-on comes from the canvas (+30). There is exactly
  // one control for it — the retired ConfigUpgrade row must be gone, not shown
  // alongside it.
  const sameColour = page.getByLabel('All same colour');
  await expect(sameColour).toHaveCount(1);
  await sameColour.check();
  await expect(page.getByText('USD 120.00').first()).toBeVisible();

  // "Flat outside" is attached to the 45/55 branches on the canvas, so it is
  // offered here; adding it stacks (+15 → 135).
  await page.getByLabel('Flat outside, inward opening').check();
  await expect(page.getByText('USD 135.00').first()).toBeVisible();
  await shot(page, 'quote-addons-01');

  // Unticking returns to the base.
  await sameColour.uncheck();
  await page.getByLabel('Flat outside, inward opening').uncheck();
  await expect(page.getByText('USD 90.00').first()).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a branch add-on is not offered off its branch, and the line still adds', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Aluminum Frame Door' });
  await page.selectOption('#cfg-variant', 'alu_wpc');
  // 40 mm: Flat outside is attached only to 45/55, so it must not appear.
  await page.selectOption('#cfg-ben_thickness', '40');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'wpc');
  await expect(page.getByLabel('Flat outside, inward opening')).toHaveCount(0);
  await expect(page.getByLabel('All same colour')).toHaveCount(1);

  await page.getByLabel('All same colour').check();
  await expect(page.getByText('USD 110.00').first()).toBeVisible(); // 80 + 30

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Add to quote' }).click(),
  ]);
  await expect(page.locator('tr', { hasText: 'All same colour' }).first()).toBeVisible({
    timeout: 30_000,
  });

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Addons ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
