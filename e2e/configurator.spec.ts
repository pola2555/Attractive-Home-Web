import { expect, test } from '@playwright/test';
import { collectConsoleErrors, optionState, shot, signInAsAdmin } from './helpers';

// The dependency tree, driven the way a person drives it. The unit tests in
// src/lib/configurator prove the logic; these prove it is actually wired to the
// screen the team will use.

test.describe.configure({ mode: 'serial' });

let quoteUrl: string;

test('sign in and reach the quotes screen', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await page.goto('/dashboard/quotes');
  await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();
  await shot(page, '01-quotes-empty');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the seeded door template is fully authored', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
  await shot(page, '02-pricing-hub');

  await page.getByRole('link', { name: 'Product templates' }).click();
  await page.getByRole('link', { name: 'door', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Door (configurable)' })).toBeVisible();
  // Every feature the template exercises should be visible on this one page.
  await expect(page.getByRole('cell', { name: 'weight_kg' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'mdf_wide_thick' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'volume_discount_50' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'setup_fee' })).toBeVisible();
  await shot(page, '03-template-detail');
});

test('create a quote and configure a door', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signInAsAdmin(page);
  await page.goto('/dashboard/quotes');

  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill('E2E door order');
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
  quoteUrl = page.url();

  await expect(page.getByRole('heading', { name: /^Q-\d{4}-\d{4}$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configure a product' })).toBeVisible();
  await shot(page, '04-quote-created');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a gated value is pending before its dependency is chosen', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });

  // Walnut stain depends on the material. Before a material is picked it must
  // be PENDING — showing it as unavailable would be a lie, and hiding it would
  // make the list look broken.
  expect(await optionState(page, 'finish_color', 'Walnut stain')).toBe('pending');
  expect(await optionState(page, 'finish_color', 'Natural')).toBe('available');

  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'solid_oak');
  expect(await optionState(page, 'finish_color', 'Walnut stain')).toBe('available');

  await page.selectOption('#cfg-door_material', 'mdf');
  expect(await optionState(page, 'finish_color', 'Walnut stain')).toBe('blocked');
  await shot(page, '05-tree-material-gates-colour');
});

test('a hidden group appears only when its condition is met', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  // Glazing is hidden entirely on a solid door — hiding only its values would
  // leave an empty required select nobody can satisfy.
  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await expect(page.locator('#cfg-glazing')).toHaveCount(0);

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'glazed');
  await expect(page.locator('#cfg-glazing')).toBeVisible();
  await shot(page, '06-glazing-appears');
});

test('the width limit narrows with thickness', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'solid_oak');

  // A number input has no values to hang a condition on, so this rule can only
  // live in the option's conditional ranges.
  await page.fill('#cfg-thickness', '40');
  await expect(page.locator('#cfg-width')).toHaveAttribute('max', '1200');

  await page.fill('#cfg-thickness', '45');
  await expect(page.locator('#cfg-width')).toHaveAttribute('max', '1400');
  await shot(page, '07-conditional-range');
});

test('a three-way forbidden combination blocks the line', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  // MDF, 1300 mm and 45 mm are each individually fine. Only the combination is
  // invalid, which no per-value condition can express.
  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'mdf');
  await page.fill('#cfg-thickness', '45');
  await page.fill('#cfg-height', '2100');
  await page.fill('#cfg-width', '1300');
  await page.selectOption('#cfg-finish_color', 'natural');

  await expect(page.getByText(/MDF is not available above 1200 mm wide/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to quote' })).toBeDisabled();
  await shot(page, '08-constraint-blocks');
});

test('derived quantities compute live and the price previews', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'solid_oak');
  await page.fill('#cfg-thickness', '45');
  await page.fill('#cfg-height', '2100');
  await page.fill('#cfg-width', '900');
  await page.selectOption('#cfg-finish_color', 'natural');

  // area 1.89 -> volume 0.08505 -> weight 59.535 (oak at 700 kg/m3)
  await expect(page.getByText('area_m2:')).toBeVisible();
  await expect(page.getByText('1.890', { exact: false })).toBeVisible();
  await expect(page.getByText('59.535', { exact: false })).toBeVisible();

  // Golden sample: 42*1.89 + 65*1.89 = 202.23, +35% margin = 273.01.
  await expect(page.getByText('USD 273.01')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to quote' })).toBeEnabled();
  await shot(page, '09-priced-preview');
});

test('adding the item stores the server-computed price', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'solid_oak');
  await page.fill('#cfg-thickness', '45');
  await page.fill('#cfg-height', '2100');
  await page.fill('#cfg-width', '900');
  await page.selectOption('#cfg-finish_color', 'natural');
  await page.fill('#cfg-qty', '10');

  await page.getByRole('button', { name: 'Add to quote' }).click();

  // Scoped to the items table: the live preview shows the same figure, and an
  // unscoped match would pass even if the row were never written.
  const itemRow = page.locator('tr', { hasText: 'Solid, Solid oak, 45 mm' });
  await expect(itemRow).toBeVisible({ timeout: 30_000 });
  // The stored price is computed on the SERVER; the browser preview is not
  // trusted. Matching here proves the two agree.
  await expect(itemRow).toContainText('USD 273.01');
  await expect(itemRow).toContainText('4418.20'); // HS code resolved for duty
  await shot(page, '10-item-added');
});

test('the volume tier fires at 50 and the setup fee stays per line', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(quoteUrl);

  // Scoped to the configurator panel: the items table above it shows the same
  // figures, so an unscoped match would not prove the preview recalculated.
  const configurator = page.locator('section', { hasText: 'Configure a product' });

  await page.selectOption('#cfg-template', { label: 'Door (configurable)' });
  await page.selectOption('#cfg-door_type', 'solid');
  await page.selectOption('#cfg-door_material', 'solid_oak');
  await page.fill('#cfg-thickness', '45');
  await page.fill('#cfg-height', '2100');
  await page.fill('#cfg-width', '900');
  await page.selectOption('#cfg-finish_color', 'natural');

  await page.fill('#cfg-qty', '49');
  await expect(configurator.getByText('USD 273.01')).toBeVisible();

  // 273.0105 less 8% = 251.17. Only expressible because `__qty` is in scope.
  await page.fill('#cfg-qty', '50');
  await expect(configurator.getByText('USD 251.17')).toBeVisible();

  // The one-off tooling charge is per LINE: 220 at any quantity, not 220 x 50.
  const setupRow = configurator.locator('tr', { hasText: 'setup_fee' });
  await expect(setupRow).toContainText('220.00');
  await expect(setupRow).toContainText('per line');
  await shot(page, '11-tier-and-setup-fee');
});
