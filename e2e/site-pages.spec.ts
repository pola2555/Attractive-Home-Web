import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { E2E_USERS } from './fixtures';
import { shot, signIn, signInAsAdmin } from './helpers';

// The dashboard "Pages" manager (/dashboard/pages): hide/show a public page,
// rename its menu label, and edit its SEO + body text — in every language.
// These specs mutate shared state, so each test restores what it changed and
// afterAll resets the table back to defaults.

const prisma = new PrismaClient();

test.afterAll(async () => {
  // Wipe every override and restore all pages to published + default placement,
  // so the rest of the suite (and dev) sees the normal site.
  await prisma.sitePageTranslation.deleteMany({});
  await prisma.sitePage.updateMany({
    data: { isPublished: true, showInNav: true, showInFooter: true },
  });
  await prisma.$disconnect();
});

// Navigate until the route returns the expected status — ISR revalidation after
// a toggle can lag a beat.
async function expectStatus(page: Page, url: string, status: number): Promise<void> {
  await expect(async () => {
    const res = await page.goto(url, { waitUntil: 'commit' });
    expect(res?.status()).toBe(status);
  }).toPass({ timeout: 25_000 });
}

// Flip a visibility switch and wait for the server action round-trip to finish.
async function flip(page: Page, label: string): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.status() < 400),
    page.getByRole('switch', { name: label }).click(),
  ]);
}

test('the manager lists every public page and locks the home toggle', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/pages');
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();

  for (const title of ['Home', 'About', 'Portfolio', 'Catalog', 'Contacts', 'Services']) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }

  // Home's visibility is locked; a hideable page's switch is enabled.
  await expect(page.getByRole('switch', { name: 'Visible — home' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Visible — about' })).toBeEnabled();
  await shot(page, '60-pages-list');
});

test('hiding a page 404s it and drops it from the nav; re-showing restores it', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/pages');

  // Hide About.
  await flip(page, 'Visible — about');
  await expectStatus(page, '/en/about', 404);

  // Gone from the top navigation too.
  await page.goto('/en');
  await expect(page.locator('nav').getByRole('link', { name: 'About' })).toHaveCount(0);

  // Re-show it.
  await page.goto('/dashboard/pages');
  await flip(page, 'Visible — about');
  await expectStatus(page, '/en/about', 200);
  await page.goto('/en');
  await expect(page.locator('nav').getByRole('link', { name: 'About' })).toBeVisible();
});

test('renaming a page updates its menu label', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/pages/about/edit');

  await page.fill('input[name="nav_en"]', 'Our Studio');
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/en');
  await expect(page.locator('nav').getByRole('link', { name: 'Our Studio' })).toBeVisible();
  await shot(page, '61-renamed-nav');

  // Restore the default label (blank → fall back to the code label).
  await page.goto('/dashboard/pages/about/edit');
  await page.fill('input[name="nav_en"]', '');
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);
  await page.goto('/en');
  await expect(page.locator('nav').getByRole('link', { name: 'Our Studio' })).toHaveCount(0);
});

test('editing page text updates the public page', async ({ page }) => {
  const marker = `E2E intro ${Date.now()}`;
  // Capture the original EN copy so we can put it back.
  const original = (
    await prisma.contentBlockTranslation.findFirst({
      where: { localeCode: 'en', contentBlock: { key: 'about.intro' } },
    })
  )?.body;

  await signInAsAdmin(page);
  await page.goto('/dashboard/pages/about/edit');

  const intro = page.locator('textarea[data-block-key="about.intro"][name$=":en"]');
  await expect(intro).toBeVisible();
  await intro.fill(marker);
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);

  await expectStatus(page, '/en/about', 200);
  await expect(page.getByText(marker)).toBeVisible();

  // Restore the original copy.
  await page.goto('/dashboard/pages/about/edit');
  await page.locator('textarea[data-block-key="about.intro"][name$=":en"]').fill(original ?? '');
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);
});

test('editing the SEO title overrides the page <title>', async ({ page }) => {
  const title = `E2E SEO ${Date.now()}`;
  await signInAsAdmin(page);
  await page.goto('/dashboard/pages/services/edit');
  await page.fill('input[name="metaTitle_en"]', title);
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);

  await expectStatus(page, '/en/services', 200);
  await expect(page).toHaveTitle(new RegExp(title));

  // Restore.
  await page.goto('/dashboard/pages/services/edit');
  await page.fill('input[name="metaTitle_en"]', '');
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);
});

test('SEO: hiding a page drops it (and its children) from the sitemap; restoring puts them back', async ({ page, request }) => {
  await signInAsAdmin(page);

  // Baseline: catalog + product URLs are advertised in the sitemap.
  const base = await (await request.get('/sitemap.xml')).text();
  expect(base).toContain('/en/catalog</loc>');
  expect(base).toContain('/en/products/');

  // Hide catalog.
  await page.goto('/dashboard/pages');
  await flip(page, 'Visible — catalog');
  await expectStatus(page, '/en/catalog', 404);

  // The landing AND every product URL (gated by catalog) leave the sitemap.
  await expect(async () => {
    const sm = await (await request.get('/sitemap.xml')).text();
    expect(sm).not.toContain('/en/catalog</loc>');
    expect(sm).not.toContain('/en/products/');
  }).toPass({ timeout: 25_000 });

  // Restore and confirm they return.
  await page.goto('/dashboard/pages');
  await flip(page, 'Visible — catalog');
  await expectStatus(page, '/en/catalog', 200);
  await expect(async () => {
    const sm = await (await request.get('/sitemap.xml')).text();
    expect(sm).toContain('/en/catalog</loc>');
    expect(sm).toContain('/en/products/');
  }).toPass({ timeout: 25_000 });
});

test('SEO: an SEO-title override does not break the canonical or hreflang tags', async ({ page }) => {
  const title = `E2E canon ${Date.now()}`;
  await signInAsAdmin(page);
  await page.goto('/dashboard/pages/about/edit');
  await page.fill('input[name="metaTitle_en"]', title);
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);

  await expectStatus(page, '/en/about', 200);
  const html = await page.content();
  // Title overridden…
  expect(html).toContain(`<title>${title}`);
  // …but the self-canonical and all four hreflang alternates are untouched.
  expect(html).toMatch(/rel="canonical"[^>]*\/en\/about/);
  for (const loc of ['en', 'ar', 'fr', 'ru']) {
    expect(html).toMatch(new RegExp(`hreflang="${loc}"[^>]*\\/${loc}\\/about`));
  }

  // Restore the default title.
  await page.goto('/dashboard/pages/about/edit');
  await page.fill('input[name="metaTitle_en"]', '');
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save changes' }).click(),
  ]);
});

test('a user without pages.write cannot reach the manager', async ({ page }) => {
  await signIn(page, E2E_USERS.dataEntry.email);
  await page.goto('/dashboard');

  // Not in the sidebar…
  await expect(page.locator('aside nav').getByRole('link', { name: 'Pages' })).toHaveCount(0);
  // …and the route itself refuses, redirecting to the dashboard root.
  await page.goto('/dashboard/pages');
  await expect(page).toHaveURL(/\/dashboard$/);
});
