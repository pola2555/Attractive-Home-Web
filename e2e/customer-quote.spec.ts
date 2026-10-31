import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { collectConsoleErrors, signInAsAdmin } from './helpers';

// Customer-facing quote: staff generate a tokenized share link, and a signed-out
// visitor opens it (no login), sees the reference, a line and the total, and an
// invalid or revoked token 404s. The line is a by-measure product priced in the
// quote's own currency (AED 26/m² × 10.5 = 273.00) so there is no FX conversion
// and no configurator data to set up.

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const PRODUCT_NAME = `E2E Customer Panel ${STAMP}`;
const QUOTE_TITLE = `E2E Customer Quote ${STAMP}`;
const PRODUCT_ID = uuidv7();

let token = '';
let reference = '';
let quoteUrl = '';

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    const source =
      (await prisma.source.findFirst({ where: { code: 'attractivehome' } })) ??
      (await prisma.source.findFirst());
    if (!source) throw new Error('No source to attach the test product to.');
    await prisma.product.create({
      data: {
        id: PRODUCT_ID,
        kind: 'by_measure',
        slug: `e2e-customer-panel-${STAMP}`,
        sourceId: source.id,
        price: 26,
        currency: 'AED',
        priceUnit: 'm²',
        isPublished: false,
        isAvailable: true,
        translations: { create: { id: uuidv7(), localeCode: 'en', name: PRODUCT_NAME } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('staff generate a share link for a quote with a line', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);

  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quotation' }).click();
  await page.getByPlaceholder('Quotation title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
  reference = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim();
  expect(reference).toMatch(/^Q-\d{4}-\d{4}$/);
  quoteUrl = page.url();

  await page.selectOption('#measure-product', PRODUCT_ID);
  await page.fill('#measure-qty', '10.5');
  await page.getByRole('button', { name: 'Add extra' }).click();
  await expect(page.getByTestId('quote-items').getByText(PRODUCT_NAME)).toBeVisible({
    timeout: 30_000,
  });

  // Generate the link; it appears (read-only input) and the quote becomes "sent".
  await page.getByRole('button', { name: 'Generate share link' }).click();
  const url = page.getByTestId('share-url');
  await expect(url).toBeVisible({ timeout: 30_000 });
  const value = await url.inputValue();
  const match = value.match(/\/en\/quote\/([A-Za-z0-9_-]{20,})$/);
  expect(match, `unexpected share url: ${value}`).not.toBeNull();
  token = match![1];

  await page.reload();
  await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('share-url')).toHaveValue(value);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a signed-out client opens the public quote; bad and revoked tokens 404', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  expect(token).not.toBe('');

  // Fresh context = no cookies, so no staff session.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  const errors = collectConsoleErrors(anonPage);

  const res = await anonPage.goto(`/en/quote/${token}`);
  expect(res?.status()).toBe(200);
  await expect(anonPage.getByTestId('quote-reference')).toHaveText(reference);
  await expect(anonPage.getByTestId('quote-lines').getByText(PRODUCT_NAME)).toBeVisible();
  await expect(anonPage.getByText('AED 273.00').first()).toBeVisible();
  await expect(anonPage.getByTestId('quote-total')).toHaveText('AED 273.00');
  await expect(anonPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  // No cost basis / landed-cost / shipment wording leaks into the client page.
  await expect(anonPage.getByText(/landed|shipment|freight|HS code/i)).toHaveCount(0);

  // RTL + translation.
  await anonPage.goto(`/ar/quote/${token}`);
  await expect(anonPage.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(anonPage.getByRole('heading', { level: 1, name: 'عرض سعر' })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);

  // Invalid token -> 404.
  const bad = await anonPage.goto('/en/quote/not-a-real-token-0123456789abcdef');
  expect(bad?.status()).toBe(404);
  await anon.close();

  // Revoke -> the same link now 404s.
  await signInAsAdmin(page);
  await page.goto(quoteUrl);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await expect(page.getByRole('button', { name: 'Generate share link' })).toBeVisible();

  const anon2 = await browser.newContext();
  const revoked = await anon2.newPage().then((p) => p.goto(`/en/quote/${token}`));
  expect(revoked?.status()).toBe(404);
  await anon2.close();
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Customer Quote ' } } });
    await prisma.product.deleteMany({
      where: {
        kind: 'by_measure',
        translations: { some: { name: { startsWith: 'E2E Customer Panel ' } } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});
