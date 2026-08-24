import { expect, test, type Page } from '@playwright/test';
import { shot, signInAsAdmin } from './helpers';

// The China -> UAE cost chain, end to end through the UI.

test.describe.configure({ mode: 'serial' });

let quoteUrl: string;

/** A quote with one priced oak door on it — the input every test here needs. */
async function quoteWithADoor(page: Page): Promise<string> {
  if (quoteUrl) return quoteUrl;

  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill('E2E landed cost');
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
  quoteUrl = page.url();

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'solid_oak');
  await page.fill('#cfg-thickness', '45');
  await page.fill('#cfg-height', '2100');
  await page.fill('#cfg-width', '900');
  await page.selectOption('#cfg-finish_color', 'natural');
  await page.fill('#cfg-qty', '20');
  await page.getByRole('button', { name: 'Add to quote' }).click();
  await expect(page.locator('tr', { hasText: 'Solid, Solid oak' })).toBeVisible({
    timeout: 30_000,
  });

  return quoteUrl;
}

test('adding an item costs the shipment automatically', async ({ page }) => {
  await signInAsAdmin(page);
  await quoteWithADoor(page);

  // Goods and insurance are inside the customs base; nothing here is guessed.
  const goods = page.locator('tr', { hasText: 'Goods (ex-works)' });
  await expect(goods).toBeVisible();
  await expect(goods).toContainText('yes'); // in CIF

  const insurance = page.locator('tr', { hasText: 'Marine insurance' });
  await expect(insurance).toBeVisible();
  await expect(insurance).toContainText('yes');

  await expect(page.getByText('Expected landed cost')).toBeVisible();
  await shot(page, '20-landed-initial');
});

test('the three freight modes are priced side by side, never blended', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  // "The maximum of an air quote plus the maximum of sea port storage" is a
  // shipment that does not exist, so the modes are compared, not summed.
  // Scoped to the cards: the same labels also appear as <option> elements in
  // the mode select below them.
  const modes = page.getByTestId('freight-modes');
  await expect(modes.getByText('Sea LCL (per revenue ton)')).toBeVisible();
  await expect(modes.getByText('Sea FCL (per container)')).toBeVisible();
  await expect(modes.getByText('Air (per chargeable kg)')).toBeVisible();

  // Each mode is priced independently against its own rate row and unit.
  await expect(modes.getByText(/USD [\d,]+\.\d{2}/)).toHaveCount(3);
  await shot(page, '21-mode-comparison');
});

test('duty sits on CIF and VAT on CIF plus duty', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  const cif = await readStat(page, 'CIF value');
  const duty = await readStat(page, 'Customs duty');

  // 5% on the wooden-door HS heading the template carries.
  expect(duty).toBeCloseTo(cif * 0.05, 1);

  const vat = await readStat(page, 'Import VAT (recoverable)');
  expect(vat).toBeCloseTo((cif + duty) * 0.05, 1);
});

test('recoverable VAT is cash flow, not cost', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  // A VAT-registered importer reverse-charges import VAT on the return.
  // Booking it as cost would overstate every quote by 5%.
  const landed = await readStat(page, 'Expected landed cost');
  const cash = await readStat(page, 'Cash outlay');
  const vat = await readStat(page, 'Import VAT (recoverable)');

  expect(cash).toBeGreaterThan(landed);
  expect(cash - landed).toBeCloseTo(vat, 1);
});

test('a post-import charge stays out of the customs base', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  const dutyBefore = await readStat(page, 'Customs duty');

  // Local delivery happens after import. Including it would inflate duty AND
  // VAT, so the "in CIF" box is deliberately left unticked.
  await page.getByPlaceholder('Label').fill('Inland delivery Dubai');
  await page.getByLabel('Charge kind').selectOption('inland');
  await page.getByLabel('Amount', { exact: true }).fill('900');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.locator('tr', { hasText: 'Inland delivery Dubai' })).toBeVisible({
    timeout: 30_000,
  });

  const dutyAfter = await readStat(page, 'Customs duty');
  expect(dutyAfter).toBeCloseTo(dutyBefore, 2);

  // It still belongs in the landed cost — just not in the duty base.
  await expect(page.locator('tr', { hasText: 'Inland delivery Dubai' })).toContainText('no');
  await shot(page, '22-post-import-excluded');
});

test('locking a line as an actual narrows the estimate band', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  const spreadBefore =
    (await readStat(page, 'High estimate')) - (await readStat(page, 'Low estimate'));
  expect(spreadBefore).toBeGreaterThan(0);

  // An invoice is a fact, so a locked component carries no band at all.
  const freight = page.locator('tr', { hasText: 'Freight (' });
  await freight.getByRole('button', { name: 'Lock as actual' }).click();
  await expect(freight.getByRole('button', { name: 'Unlock' })).toBeVisible({ timeout: 30_000 });

  const spreadAfter =
    (await readStat(page, 'High estimate')) - (await readStat(page, 'Low estimate'));
  expect(spreadAfter).toBeLessThan(spreadBefore);
  await shot(page, '23-locked-actual');
});

test('per-item landed cost answers what one door costs', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  await expect(page.getByRole('heading', { name: 'Per item' })).toBeVisible();
  const row = page.locator('tr', { hasText: 'Door (configurable)' }).last();
  await expect(row).toContainText('AED');
  await shot(page, '24-per-item-landed');
});

test('a sent quote freezes: pricing can no longer be edited', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(await quoteWithADoor(page));

  await page.selectOption('#q-status', 'sent');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Pricing frozen')).toBeVisible({ timeout: 30_000 });

  // Prices that keep moving after the customer has seen them are not a quote.
  await expect(page.getByRole('heading', { name: 'Configure a product' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Re-cost from rate cards' })).toHaveCount(0);
  await shot(page, '25-frozen-quote');
});

/** Reads one of the headline figures, e.g. "AED 12,345.67" -> 12345.67. */
async function readStat(page: Page, label: string): Promise<number> {
  const cell = page.locator(`[data-stat="${label}"]`);
  await expect(cell).toBeVisible();
  const text = await cell.innerText();
  const value = Number(text.replace(/[^0-9.]/g, ''));
  expect(Number.isFinite(value), `could not read "${label}" from "${text}"`).toBe(true);
  return value;
}
