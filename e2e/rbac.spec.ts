import { expect, test } from '@playwright/test';
import { E2E_USERS } from './fixtures';
import { shot, signIn, signInAsAdmin } from './helpers';

// The security boundary this module exists to protect: customers never see
// prices, and neither does the role that enters catalog data.

test('data-entry cannot reach pricing or quotes', async ({ page }) => {
  await signIn(page, E2E_USERS.dataEntry.email);
  await page.goto('/dashboard');

  // Scoped to the sidebar: the overview body also links to /dashboard/products
  // from its stat tiles.
  const nav = page.locator('aside nav');

  // The seeded data-entry role holds catalog.write. If pricing had been folded
  // into that permission, this role would be able to read the company's cost
  // basis and margins.
  await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Quotes' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible();
  await shot(page, '30-data-entry-nav');

  // Not just hidden in the nav — the routes themselves refuse.
  await page.goto('/dashboard/pricing');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/dashboard/quotes');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/dashboard/pricing/rates');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('sales can quote but cannot edit pricing rules', async ({ page }) => {
  await signIn(page, E2E_USERS.sales.email);
  await page.goto('/dashboard');

  const nav = page.locator('aside nav');
  await expect(nav.getByRole('link', { name: 'Quotes' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
  await shot(page, '31-sales-nav');

  await page.goto('/dashboard/quotes');
  await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();

  // Rate cards reveal the cost basis, so they stay admin-only.
  await page.goto('/dashboard/pricing/templates');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('an admin reaches everything', async ({ page }) => {
  await signInAsAdmin(page);
  const nav = page.locator('aside nav');
  await expect(nav.getByRole('link', { name: 'Quotes' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Pricing' })).toBeVisible();
  await shot(page, '32-admin-nav');
});

test('the optimistic lock refuses a stale save', async ({ page, context }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill('E2E concurrency');
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
  const url = page.url();

  // Two people with the same quote open — exactly what optimisticLock.ts exists
  // for. The second tab is loaded first so it holds the older updatedAt.
  const second = await context.newPage();
  await second.goto(url);
  await expect(second.locator('#q-title')).toBeVisible();

  await page.fill('#q-title', 'E2E concurrency — first writer');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 30_000 });

  await second.fill('#q-title', 'E2E concurrency — second writer');
  await second.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(second.getByText(/Someone else changed this record/)).toBeVisible({
    timeout: 30_000,
  });
  await shot(second, '33-optimistic-lock');
  await second.close();
});
