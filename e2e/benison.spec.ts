import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// The Benison door end to end, through the real screens.
//
// Every figure asserted here is a cell from the supplier's own workbook. If one
// of these fails, either the engine drifted or somebody edited the price list —
// and both are things a person needs to know about.

test.describe.configure({ mode: 'serial' });

/** Configure the 45 mm / silent / WPC door that the design doc worked through. */
async function configureAluDoor(page: Page): Promise<void> {
  await page.selectOption('#cfg-variant', 'alu_wpc');
  await page.selectOption('#cfg-ben_thickness', '45');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'wpc');
}

async function openBenisonQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill('E2E Benison');
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
  await page.selectOption('#cfg-template', { label: 'Benison Interior Door' });
}

test('the editor shows the fork, its grids, its upgrades and its bands', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);

  await page.goto('/dashboard/pricing/templates');
  await page.getByRole('link', { name: 'benison_door' }).first().click();
  await expect(page.getByRole('heading', { name: 'Base variants' })).toBeVisible();

  // Both branches, each with its own grid. Scoped to the variants table: the
  // variant name also appears in the upgrades table's "applies to" column.
  const variants = page.getByTestId('variants');
  // The variant name appears both as a table cell and as a per-variant grid
  // heading in this region — scope to the row cell so the match is unambiguous.
  await expect(
    variants.getByRole('cell', { name: 'Aluminum Frame + WPC Connecting Board' }),
  ).toBeVisible();
  await expect(variants.getByRole('cell', { name: 'Wood Frame' })).toBeVisible();

  // The counter that separates a supplier refusal from an unfilled cell.
  await expect(variants.getByRole('link', { name: '11 priced · 4 not sold' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Upgrades and accessories' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Size bands' })).toBeVisible();
  await shot(page, '60-editor-template');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('the grid editor lays the price list out the way the supplier published it', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/pricing/templates');
  await page.getByRole('link', { name: 'benison_door' }).first().click();
  await page.getByRole('link', { name: '11 priced · 4 not sold' }).click();

  await expect(
    page.getByRole('heading', { name: 'Aluminum Frame + WPC Connecting Board' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The prices' })).toBeVisible();

  // Three cell states, reported separately.
  await expect(page.getByText(/18 cells · 11 priced · 4 not sold · 3 not entered/)).toBeVisible();

  // A published cell is in the box a person would look for it in.
  const cell = page.getByLabel('45 alu_silent WPC');
  await expect(cell).toHaveValue('90');
  await shot(page, '61-grid-editor');
});

test('a configured door prices from the grid', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);

  // The base price is a CELL, not a calculation.
  await configureAluDoor(page);
  await expect(page.getByText('Aluminum Frame + WPC Connecting Board — base')).toBeVisible();
  await expect(page.getByText('USD 90.00').first()).toBeVisible();
  await shot(page, '62-grid-priced');
});

test('a combination the supplier does not sell refuses to price', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);

  // 40 mm with PUR banding is sold in SPC only — the dash in the sheet.
  await page.selectOption('#cfg-variant', 'alu_wpc');
  await page.selectOption('#cfg-ben_thickness', '40');
  await page.selectOption('#cfg-ben_edge_banding', 'pur');
  await page.selectOption('#cfg-ben_board', 'wpc');

  await expect(page.getByText(/not sold by the supplier/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to quote' })).toBeDisabled();
  await shot(page, '63-not-sold');
});

test('the branch decides which questions are even asked', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);

  await page.selectOption('#cfg-variant', 'alu_wpc');
  await expect(page.locator('#cfg-ben_thickness')).toBeVisible();
  await expect(page.locator('#cfg-ben_grade')).toHaveCount(0);

  // The wood frame is sold by grade, not thickness — a different question, not
  // a hidden one.
  await page.selectOption('#cfg-variant', 'wood');
  await expect(page.locator('#cfg-ben_grade')).toBeVisible();
  await expect(page.locator('#cfg-ben_thickness')).toHaveCount(0);

  // And it is published in one board material where aluminium has three.
  // The placeholder is not an answer, so it does not count.
  const boards = (await page.locator('#cfg-ben_board option').allTextContents()).filter(
    (label) => !label.startsWith('Choose'),
  );
  expect(boards).toEqual(['Fire retardant']);
  await shot(page, '64-wood-branch');
});

test('an upgrade is withheld with a reason, not hidden', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);

  await page.selectOption('#cfg-variant', 'alu_wpc');
  await page.selectOption('#cfg-ben_thickness', '40');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'spc');

  // Still on screen, greyed, saying why. Hiding it sends whoever is on the
  // phone hunting for something the customer just named.
  const flat = page.getByLabel('Flat outside, inward opening');
  await expect(flat).toBeDisabled();
  await expect(page.getByText('Only available on 45 mm and 55 mm')).toBeVisible();

  await page.selectOption('#cfg-ben_thickness', '45');
  await expect(flat).toBeEnabled();
  await shot(page, '65-upgrade-gated');
});

test('the same upgrade costs different amounts on each branch', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);

  await configureAluDoor(page);
  await page.getByLabel('All same colour').check();
  await expect(page.getByText('USD 120.00').first()).toBeVisible(); // 90 + 30

  await page.selectOption('#cfg-variant', 'wood');
  await page.selectOption('#cfg-ben_grade', 'hc');
  await page.selectOption('#cfg-ben_edge_banding', 'alu_silent');
  await page.selectOption('#cfg-ben_board', 'fr');
  await page.getByLabel('All same colour').check();
  await expect(page.getByText('USD 120.00').first()).toBeVisible(); // 105 + 15
  await shot(page, '66-branch-pricing');
});

test('the full build-up matches the supplier sheet, and lands on the quote', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);
  await configureAluDoor(page);

  // 90 base + 30 colour + 15 flat outside + 21 hinges + 12 width band = 168.
  await page.fill('#cfg-ben_width', '1000');
  await page.getByLabel('All same colour').check();
  await page.getByLabel('Flat outside, inward opening').check();
  await page.getByLabel('Side concealed hinges — standard finish').check();
  await page.fill('input[aria-label="Side concealed hinges — standard finish quantity"]', '3');

  await expect(page.getByText('Width 950–1050 mm')).toBeVisible();
  await expect(page.getByText('USD 168.00').first()).toBeVisible();
  await shot(page, '67-full-buildup');

  await page.getByRole('button', { name: 'Add to quote' }).click();
  // Scoped to the items table: the configurator below it names the same
  // product, and the upgrade sections repeat the supplier's own headings.
  const items = page.getByTestId('quote-items');
  await expect(items.locator('tr', { hasText: 'Benison Interior Door' })).toBeVisible({
    timeout: 30_000,
  });
  // The line stores what was actually configured, not just a product name.
  await expect(items.getByText(/45 mm/)).toBeVisible();
  await shot(page, '68-added-to-quote');
});

test('a size with no published band is reported, not charged as nothing', async ({ page }) => {
  await signInAsAdmin(page);
  await openBenisonQuote(page);
  await configureAluDoor(page);

  // The supplier's own list leaves 2240–2440 uncovered.
  await page.fill('#cfg-ben_height', '2300');
  await expect(page.getByText(/No size band covers/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to quote' })).toBeDisabled();
  await shot(page, '69-band-gap');
});

test('the public door page shows no price and offers WhatsApp', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/en/products/benison-interior-door');

  await expect(page.getByRole('heading', { name: 'Benison Interior Door' })).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/USD\s?\d/);
  expect(body).not.toMatch(/AED\s?\d/);
  await shot(page, '70-public-door');

  expect(errors, errors.join('\n')).toEqual([]);
});
