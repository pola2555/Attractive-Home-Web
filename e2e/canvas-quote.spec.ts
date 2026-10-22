import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, signInAsAdmin } from './helpers';

// End-to-end for a product built entirely on the visual tree canvas ("test
// door"): its base questions are derived from the tree, so the quote must let a
// user configure it, price it, and add it as a line.

const STAMP = Date.now();
const QUOTE_TITLE = `E2E Canvas ${STAMP}`;

async function openNewQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quotation' }).click();
  await page.getByPlaceholder('Quotation title (optional)').fill(QUOTE_TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

test('canvas-built test door configures, prices and adds to a quote', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await openNewQuote(page);

  await page.selectOption('#cfg-template', { label: 'test door' });
  await page.selectOption('#cfg-variant', 'build_1');

  // Stepped reveal: thickness opens edge opens material. The aluminium-silent
  // edge branch is the one the colours are attached to.
  await page.selectOption('#cfg-thickness', 'c_40');
  await page.selectOption('#cfg-pur_edge_banding', 'aluminum_silent_edge_banding');
  await page.selectOption('#cfg-material', 'spc');

  // The Colour question appears only once its branch is reached (stepped reveal),
  // rendered as swatches derived from the canvas colour nodes.
  const colour = page.getByTestId('cfg-colour-colour');
  await expect(colour).toBeVisible();
  await colour.getByRole('button', { name: 'Marsha Grey' }).click();

  // Base price on this branch is 80.
  await expect(page.getByText('USD 80.00').first()).toBeVisible();

  // Option-tree add-on: choosing a hinge finish adds its leaf price on top
  // (Color-matched +11 → 91), straight from the canvas sub-tree.
  await page.getByLabel('Side concealed hinges').selectOption('color_matched');
  await expect(page.getByText('USD 91.00').first()).toBeVisible();

  // Priceable branch → Add enables.
  const addBtn = page.getByRole('button', { name: 'Add to quote' });
  await expect(addBtn).toBeEnabled();
  await addBtn.click();

  // The line lands in the Items table and records the chosen colour.
  const items = page.getByTestId('quote-items');
  await expect(items.getByText('test door').first()).toBeVisible();
  await expect(items.getByText('Marsha Grey').first()).toBeVisible();

  expect(errors).toEqual([]);
});
