import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The two audit fixes on the Aluminum Frame: (1) the $40 "Aluminum Frame + WPC
// connecting board" lock prices like any accessory, and (3) a 1050–1220 mm wide
// door is blocked for the three non-permitted colours (Marsha/Milan/Matte) and
// allowed for the five permitted ones.

const STAMP = Date.now();
const QUOTE_TITLE = `E2E Alu Rules ${STAMP}`;

async function openQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('wide-door colour rule blocks, and the $40 lock prices', async ({ page }) => {
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

  // Width 1100 falls in the 1050–1220 band: +23 → 113.
  await page.fill('#cfg-ben_width', '1100');
  await expect(page.getByText('USD 113.00').first()).toBeVisible();

  // A forbidden colour at this width blocks the add.
  await page.selectOption('#cfg-ben_color', 'matte_black');
  await expect(page.getByText(/only made in Zeppelin Grey/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to quote' })).toBeDisabled();

  // A permitted colour clears it.
  await page.selectOption('#cfg-ben_color', 'platinum');
  await expect(page.getByText(/only made in Zeppelin Grey/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to quote' })).toBeEnabled();

  // The $40 lock adds to the line: 113 + 40 = 153.
  await page.check('#upg-lock_alu_wpc_set');
  await expect(page.getByText('USD 153.00').first()).toBeVisible();
  await shot(page, 'alu-rules-01');

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Alu Rules ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
