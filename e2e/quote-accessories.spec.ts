import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// Phase 3: accessories in a quote. A PUBLIC accessory (seeded here) is offered
// in the quote configurator for every template; we configure the Benison alu
// door (base USD 90), add 4 locks at 22 (= 88), and check the combined total in
// the preview (178) and the "+88 accessories" note on the added line. Accessories
// are priced at their listed price and kept OUT of the door's margin/landed cost.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const ACC_NAME = `E2E Acc Lock ${STAMP}`;
const QUOTE_TITLE = `E2E Acc Quote ${STAMP}`;
const ACC_ID = uuidv7();

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.accessory.create({
      data: {
        id: ACC_ID,
        name: ACC_NAME,
        category: 'Locks',
        scope: 'public',
        ownerProductId: null,
        pricingMode: 'per_item',
        unitPrice: 22,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

async function openBenisonQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
  await page.selectOption('#cfg-template', { label: 'Benison Interior Door' });
}

test('an accessory rides on the quote line at its listed price', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openBenisonQuote(page);

  // Configure the 45 / silent / WPC door — base USD 90.
  await page.selectOption('#cfg-variant', 'alu_wpc');
  await page.selectOption('#cfg-ben_thickness', '45');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'wpc');
  await expect(page.getByText('USD 90.00').first()).toBeVisible();

  // The accessory is offered (public → every template).
  await expect(page.getByText('Accessories — sold separately')).toBeVisible();
  const check = page.locator(`#acc-${ACC_ID}`);
  await expect(check).toBeVisible();
  await check.check();
  await page.fill(`input[aria-label="${ACC_NAME} quantity"]`, '4');

  // Combined total = 90 (door) + 88 (4 × 22) = 178.
  const totalRow = page.locator('tr', { hasText: 'Item total incl. accessories' });
  await expect(totalRow).toContainText('178.00');
  await shot(page, 'quote-acc-01-preview');

  await page.getByRole('button', { name: 'Add to quote' }).click();
  const items = page.getByTestId('quote-items');
  await expect(items.locator('tr', { hasText: 'Benison Interior Door' })).toBeVisible({
    timeout: 30_000,
  });
  // The line carries the accessory subtotal, separate from the door unit cost.
  await expect(items.getByText(/\+\s*USD\s*88\.00\s*accessories/)).toBeVisible();
  await expect(items.getByText(new RegExp(`${ACC_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}×4`))).toBeVisible();
  await shot(page, 'quote-acc-02-added');

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.accessory.deleteMany({ where: { name: { startsWith: 'E2E Acc Lock ' } } });
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Acc Quote ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
