import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// Option B: by-measure items (wall panels, grilles…) sold per m²/piece, added to a
// quote as their own line with a FRACTIONAL amount. One seeded product ($26/m²) is
// put on a quote at 10.5 m² (= 273.00). A second product is created through the UI
// form to cover createMeasureProduct. Both self-clean.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const SEED_NAME = `E2E Measure Panel ${STAMP}`;
const UI_NAME = `E2E Measure Grille ${STAMP}`;
const QUOTE_TITLE = `E2E Measure Quote ${STAMP}`;
const SEED_ID = uuidv7();

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    const source =
      (await prisma.source.findFirst({ where: { code: 'attractivehome' } })) ??
      (await prisma.source.findFirst());
    if (!source) throw new Error('No source to attach the test product to.');
    await prisma.product.create({
      data: {
        id: SEED_ID,
        kind: 'by_measure',
        slug: `e2e-measure-panel-${STAMP}`,
        sourceId: source.id,
        price: 26,
        currency: 'USD',
        priceUnit: 'm²',
        isPublished: false,
        isAvailable: true,
        translations: { create: { id: uuidv7(), localeCode: 'en', name: SEED_NAME } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('a by-measure product can be created through the form', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);

  await page.goto('/dashboard/products/new?type=measure');
  await page.fill('#name', UI_NAME);
  await page.selectOption('#sourceId', { index: 1 }); // first real supplier (0 = placeholder)
  await page.fill('#unitPrice', '15');
  await page.fill('#priceUnit', 'piece');
  await expect(page.getByText(/Example:\s*10 piece × USD 15\.00 = USD 150\.00/)).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/dashboard\/products(\?.*)?$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create item' }).click(),
  ]);

  await page.goto(`/dashboard/products?q=${encodeURIComponent(UI_NAME)}`);
  await expect(page.getByText(UI_NAME).first()).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

async function openMeasureQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('a by-measure item rides on a quote line at a fractional amount', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openMeasureQuote(page);

  // 10.5 m² × USD 26.00 = 273.00. The running total shows before adding.
  await expect(page.getByText('Add an extra')).toBeVisible();
  await page.selectOption('#measure-product', SEED_ID);
  await page.fill('#measure-qty', '10.5');
  await expect(page.getByText('= USD 273.00')).toBeVisible();
  await shot(page, 'measure-01-preview');

  await page.getByRole('button', { name: 'Add extra' }).click();

  const items = page.getByTestId('quote-items');
  await expect(items.getByText(SEED_NAME)).toBeVisible({ timeout: 30_000 });
  // The line shows the per-unit breakdown, and the quantity box accepts decimals.
  await expect(items.getByText(/10\.5\s*m².*26\.00/)).toBeVisible();
  await shot(page, 'measure-02-added');

  expect(errors, errors.join('\n')).toEqual([]);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Measure Quote ' } } });
    await prisma.product.deleteMany({
      where: {
        kind: 'by_measure',
        translations: { some: { name: { startsWith: 'E2E Measure ' } } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});
