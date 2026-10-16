import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The freshly-seeded "Aluminum Frame Door" tree product must price straight off
// the Excel table: 40/PUR/SPC = 65, 45/alu-silent/WPC = 90, 55/alu-silent/FR =
// 100, plus the automatic width band (+23 at 1050–1220 mm). Proves the base price
// tree, the option wiring and the size bands. The product persists; only the test
// quote is cleaned up.

const STAMP = Date.now();
const QUOTE_TITLE = `E2E Alu Frame ${STAMP}`;

async function openQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('Aluminum Frame Door prices from the Excel table', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Aluminum Frame Door' });
  await page.selectOption('#cfg-variant', 'alu_wpc');

  // 45 mm / aluminium silent / WPC = 90.
  await page.selectOption('#cfg-ben_thickness', '45');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'wpc');
  await expect(page.getByText('USD 90.00').first()).toBeVisible();

  // 40 mm / PUR / SPC = 65 (the only PUR cell for 40 mm).
  await page.selectOption('#cfg-ben_thickness', '40');
  await page.selectOption('#cfg-ben_edge_banding', 'pur');
  await page.selectOption('#cfg-ben_board', 'spc');
  await expect(page.getByText('USD 65.00').first()).toBeVisible();

  // 55 mm / aluminium silent / fire-retardant = 100.
  await page.selectOption('#cfg-ben_thickness', '55');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'fr');
  await expect(page.getByText('USD 100.00').first()).toBeVisible();

  // Width 1100 mm falls in the 1050–1220 band (+23): 100 + 23 = 123.
  await page.fill('#cfg-ben_width', '1100');
  await expect(page.getByText('USD 123.00').first()).toBeVisible();
  await shot(page, 'alu-frame-01-priced');

  // It adds to the quote like any configured product.
  await page.getByRole('button', { name: 'Add to quote' }).click();
  const items = page.getByTestId('quote-items');
  await expect(items.getByText('Aluminum Frame Door')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'alu-frame-02-added');

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Alu Frame ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
