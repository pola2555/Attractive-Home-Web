import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The quote configurator now descends the tree the way the canvas draws it:
// each question opens only once the choice it depends on has been made, and the
// extras (quantity, upgrades, accessories) open only once the base door is
// fully specified. This walks that reveal on the Aluminum Frame Door.

const STAMP = Date.now();
const QUOTE_TITLE = `E2E Reveal ${STAMP}`;

async function openQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('each answer opens the next level of the tree', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Aluminum Frame Door' });

  // Before a base variant is picked, the tree questions are not open at all.
  await expect(page.locator('#cfg-ben_thickness')).toHaveCount(0);
  await page.selectOption('#cfg-variant', 'alu_wpc');

  // Thickness is open; the questions that depend on it are still shut — the
  // edge waits on the thickness, the board on the edge, the colours on the
  // silent edge.
  await expect(page.locator('#cfg-ben_thickness')).toBeVisible();
  await expect(page.locator('#cfg-ben_edge_banding')).toHaveCount(0);
  await expect(page.locator('#cfg-ben_board')).toHaveCount(0);
  await expect(page.locator('#cfg-ben_color')).toHaveCount(0);

  // Thickness opens the edge question; the board still waits on the edge.
  await page.selectOption('#cfg-ben_thickness', '45');
  await expect(page.locator('#cfg-ben_edge_banding')).toBeVisible();
  await expect(page.locator('#cfg-ben_board')).toHaveCount(0);
  await expect(page.locator('#cfg-ben_color')).toHaveCount(0);

  // The silent edge opens the board — and the colours, which live on that
  // branch of the door.
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await expect(page.locator('#cfg-ben_board')).toBeVisible();
  await expect(page.locator('#cfg-ben_color')).toBeVisible();

  // Completing the board prices the door.
  await page.selectOption('#cfg-ben_board', 'wpc');
  await expect(page.getByText('USD 90.00').first()).toBeVisible();
  await shot(page, 'quote-reveal-01');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('the dropdowns follow the branch and never mix them', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openQuote(page);

  await page.selectOption('#cfg-template', { label: 'Aluminum Frame Door' });
  await page.selectOption('#cfg-variant', 'alu_wpc');

  // 45 mm offers both edges.
  await page.selectOption('#cfg-ben_thickness', '45');
  await expect(page.locator('#cfg-ben_edge_banding option[value="pur"]')).toHaveCount(1);
  await expect(page.locator('#cfg-ben_edge_banding option[value="alu_silent"]')).toHaveCount(1);

  // The PUR branch offers ONLY the SPC board — not WPC/FR — and no colour at all.
  await page.selectOption('#cfg-ben_edge_banding', 'pur');
  await expect(page.locator('#cfg-ben_board option[value="spc"]')).toHaveCount(1);
  await expect(page.locator('#cfg-ben_board option[value="wpc"]')).toHaveCount(0);
  await expect(page.locator('#cfg-ben_board option[value="fr"]')).toHaveCount(0);
  await page.selectOption('#cfg-ben_board', 'spc');
  await expect(page.getByText('USD 75.00').first()).toBeVisible();
  await expect(page.locator('#cfg-ben_color')).toHaveCount(0); // no colour on PUR

  // The silent-edge branch offers all three boards and unlocks the colours.
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await expect(page.locator('#cfg-ben_board option[value="wpc"]')).toHaveCount(1);
  await expect(page.locator('#cfg-ben_board option[value="fr"]')).toHaveCount(1);
  // SPC survived the switch (it exists on both branches); colour now appears.
  await expect(page.locator('#cfg-ben_board')).toHaveValue('spc');
  await expect(page.locator('#cfg-ben_color')).toBeVisible();
  await page.selectOption('#cfg-ben_board', 'wpc');
  await expect(page.getByText('USD 90.00').first()).toBeVisible();

  // 55 mm has no PUR edge at all.
  await page.selectOption('#cfg-ben_thickness', '55');
  await expect(page.locator('#cfg-ben_edge_banding option[value="pur"]')).toHaveCount(0);
  await expect(page.locator('#cfg-ben_edge_banding option[value="alu_silent"]')).toHaveCount(1);
  // The silent edge + WPC carried across, now at the 55 mm price.
  await expect(page.getByText('USD 100.00').first()).toBeVisible();
  await shot(page, 'quote-reveal-02-branches');

  // Stepping BACK to PUR must clear the WPC board the branch never had, rather
  // than leave it to price nothing.
  await page.selectOption('#cfg-ben_thickness', '45');
  await page.selectOption('#cfg-ben_edge_banding', 'pur');
  await expect(page.locator('#cfg-ben_board')).toHaveValue('');
  await expect(page.locator('#cfg-ben_board option[value="wpc"]')).toHaveCount(0);
  await expect(page.locator('#cfg-ben_color')).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Reveal ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
