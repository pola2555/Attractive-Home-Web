import { expect, test } from '@playwright/test';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// A sweep of everything that existed before this module, plus everything it
// added. The point is not to re-test each feature — it is to prove that adding
// the configurator did not break a page that used to work.

const PUBLIC_ROUTES = [
  '/en',
  '/en/catalog',
  '/en/about',
  '/en/services',
  '/en/portfolio',
  '/en/contacts',
  '/en/account/sign-in',
  '/ar',
  '/ar/catalog',
];

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/leads',
  '/dashboard/products',
  '/dashboard/facets',
  '/dashboard/catalog-filters',
  '/dashboard/portfolio',
  '/dashboard/portfolio/projects',
  '/dashboard/services',
  '/dashboard/content',
  '/dashboard/settings',
  '/dashboard/users',
  '/dashboard/customers',
  '/dashboard/audit',
  '/dashboard/quotes',
  '/dashboard/pricing',
  '/dashboard/pricing/options',
  '/dashboard/pricing/templates',
  '/dashboard/pricing/rates',
];

test('every public route renders without a console error', async ({ page }) => {
  const failures: string[] = [];

  for (const route of PUBLIC_ROUTES) {
    const errors = collectConsoleErrors(page);
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

    if (!response || response.status() >= 400) {
      failures.push(`${route} -> HTTP ${response?.status() ?? 'no response'}`);
      continue;
    }
    // A Next error page renders 200 with the overlay, so check the content too.
    const body = await page.locator('body').innerText();
    if (/Application error|Unhandled Runtime Error/i.test(body)) {
      failures.push(`${route} -> runtime error on the page`);
    }
    if (errors.length) failures.push(`${route} -> ${errors.join(' | ')}`);
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
  }

  expect(failures, failures.join('\n')).toEqual([]);
});

test('every dashboard route renders without a console error', async ({ page }) => {
  await signInAsAdmin(page);
  const failures: string[] = [];

  for (const route of DASHBOARD_ROUTES) {
    const errors = collectConsoleErrors(page);
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

    if (!response || response.status() >= 400) {
      failures.push(`${route} -> HTTP ${response?.status() ?? 'no response'}`);
      continue;
    }
    // A redirect away from the route means the auth gate rejected an admin,
    // which would be a real defect.
    if (!page.url().includes(route)) {
      failures.push(`${route} -> redirected to ${page.url()}`);
      continue;
    }
    const body = await page.locator('body').innerText();
    if (/Application error|Unhandled Runtime Error/i.test(body)) {
      failures.push(`${route} -> runtime error on the page`);
    }
    if (errors.length) failures.push(`${route} -> ${errors.join(' | ')}`);
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
  }

  expect(failures, failures.join('\n')).toEqual([]);
});

test('the catalog still filters, and still shows no prices', async ({ page }) => {
  await page.goto('/en/catalog');
  await expect(page.locator('a[href*="/en/products/"]').first()).toBeVisible({ timeout: 60_000 });

  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/AED\s?\d/);

  await shot(page, '50-catalog-regression');
});

test('the products dashboard still works and still shows internal prices', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/products');
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

  // Prices are internal, not gone: staff with catalog.read still need them.
  await expect(page.getByRole('columnheader', { name: /price/i }).first()).toBeVisible();
  await shot(page, '51-products-dashboard');
});
