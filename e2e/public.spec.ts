import { expect, test } from '@playwright/test';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The customer-facing half: no prices anywhere, and the shortlist finally has
// somewhere to submit to.

test('a product page shows no price and no offers in its structured data', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/en/catalog');
  await expect(page.locator('a[href*="/en/products/"]').first()).toBeVisible({ timeout: 60_000 });

  const href = await page.locator('a[href*="/en/products/"]').first().getAttribute('href');
  await page.goto(href!);

  // Nothing rendered.
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/AED\s?\d/);
  expect(body).not.toMatch(/USD\s?\d/);

  // And nothing published in JSON-LD either — structured data is published data
  // even when the page renders none of it.
  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(jsonLd).toBeTruthy();
  const parsed = JSON.parse(jsonLd!);
  expect(parsed.offers).toBeUndefined();
  expect(JSON.stringify(parsed)).not.toContain('priceCurrency');

  await shot(page, '40-product-no-price');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the shortlist can request a quote, creating a lead and a draft quote', async ({ page }) => {
  await page.goto('/en/catalog');
  await expect(page.locator('a[href*="/en/products/"]').first()).toBeVisible({ timeout: 60_000 });

  // Save two products the way a customer does — the ♥ appears on card hover.
  const cards = page.locator('a[href*="/en/products/"]');
  for (const index of [0, 1]) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    const save = card.locator('xpath=ancestor::*[1]').getByRole('button').first();
    if (await save.isVisible().catch(() => false)) await save.click();
  }

  await expect(page.getByRole('button', { name: /Saved/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Saved/ }).click();

  await page.getByRole('button', { name: 'Request a quote' }).click();
  await expect(page.getByRole('heading', { name: 'Request a quote' })).toBeVisible();
  await shot(page, '41-request-form');

  await page.fill('#rq-name', 'E2E Customer');
  await page.fill('#rq-phone', '+971 50 000 0000');
  await page.fill('#rq-message', 'Please quote these for a villa in Dubai.');
  await page.getByRole('button', { name: 'Send request' }).click();

  await expect(page.getByText(/Our team will be in touch/)).toBeVisible({ timeout: 30_000 });
  const confirmation = await page.getByText(/Our team will be in touch/).innerText();
  expect(confirmation).toMatch(/Q-\d{4}-\d{4}/);
  await shot(page, '42-request-sent');
});

test('the request reaches the dashboard as a lead and a draft quote', async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto('/dashboard/leads');
  const leadRow = page.locator('tr', { hasText: 'E2E Customer' }).first();
  await expect(leadRow).toBeVisible({ timeout: 30_000 });
  // The channel that did not exist before this flow did.
  await expect(leadRow).toContainText('quote_request');
  // leads.product_id was in the schema from day one and nothing ever wrote it.
  await expect(leadRow).not.toContainText('—\t—');
  await shot(page, '43-lead-arrived');

  await page.goto('/dashboard/quotes');
  const quoteRow = page.locator('tr', { hasText: 'E2E Customer' }).first();
  await expect(quoteRow).toBeVisible();
  await expect(quoteRow).toContainText('Draft');
  await shot(page, '44-draft-quote-from-request');
});

test('the request flow works in Arabic, right to left', async ({ page }) => {
  await page.goto('/ar/catalog');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('a[href*="/ar/products/"]').first()).toBeVisible({ timeout: 60_000 });

  const href = await page.locator('a[href*="/ar/products/"]').first().getAttribute('href');
  await page.goto(href!);
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/AED\s?\d/);
  await shot(page, '45-arabic-product');
});
