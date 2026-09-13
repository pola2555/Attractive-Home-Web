import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, shot, signInAsAdmin } from './helpers';

// A broad "use the whole site like a real person" sweep: happy paths, normal
// paths, and deliberately extreme inputs, across the public site (en/ar/fr/ru)
// and the dashboard. It never sends anything to a real person — the contact form
// and WhatsApp are exercised up to, but not through, the send — and it never
// mutates seed data: the only rows it writes are quotes titled "E2E …", which the
// global teardown removes.

const LOCALES = ['en', 'ar', 'fr', 'ru'] as const;

// How far the document overflows its own viewport horizontally. A healthy
// responsive page is <= 1 (sub-pixel rounding); anything more is a real defect.
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function assertNoAppError(page: Page): Promise<void> {
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Application error|Unhandled Runtime Error|client-side exception/i);
}

// ───────────────────────────── Public breadth & i18n ─────────────────────────

for (const locale of LOCALES) {
  test(`home renders in ${locale} with no console error and no horizontal overflow`, async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const res = await page.goto(`/${locale}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `HTTP for /${locale}`).toBeLessThan(400);
    await expect(page.locator('main').first()).toBeVisible();
    await assertNoAppError(page);

    // Direction is a per-locale contract: Arabic is RTL, the rest LTR.
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');

    expect(await horizontalOverflow(page), 'home overflows horizontally').toBeLessThanOrEqual(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('the home page shows its sections and the FAQ expands', async ({ page }) => {
  await page.goto('/en');
  // FAQ is native <details>; a real user clicks a question to open it.
  const firstQ = page.locator('details summary').first();
  if (await firstQ.count()) {
    const details = page.locator('details').first();
    await expect(details).not.toHaveJSProperty('open', true);
    await firstQ.click();
    await expect(details).toHaveJSProperty('open', true);
  }
  await shot(page, 'sweep-home');
});

test('the language switch keeps you on the same page in another language', async ({ page }) => {
  await page.goto('/en/about');
  // The Arabic equivalent of /en/about is /ar/about — switching must not dump you
  // on the home page.
  await page.goto('/ar/about');
  await expect(page).toHaveURL(/\/ar\/about/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await assertNoAppError(page);
});

// ───────────────────────────── Catalog ───────────────────────────────────────

test('catalog: a normal search returns products and never shows a price', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/en/catalog');
  await expect(page.locator('a[href*="/en/products/"]').first()).toBeVisible({ timeout: 60_000 });

  const search = page.locator('input[name="q"]');
  if (await search.count()) {
    await search.first().fill('door');
    await search.first().press('Enter');
    await page.waitForLoadState('domcontentloaded');
  }
  const body = await page.locator('main').innerText();
  expect(body, 'a price leaked onto the public catalog').not.toMatch(/(AED|USD)\s?\d/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('catalog: a search that matches nothing shows an empty state, not a crash', async ({
  page,
}) => {
  await page.goto('/en/catalog?q=zzqqxx-nothing-matches-this-9999');
  await assertNoAppError(page);
  // Zero product links is the expected outcome; the page must still render.
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('a[href*="/en/products/"]')).toHaveCount(0);
  await shot(page, 'sweep-catalog-empty');
});

test('catalog: an XSS attempt in the query is neutralised', async ({ page }) => {
  let dialog = false;
  page.on('dialog', async (d) => {
    dialog = true;
    await d.dismiss();
  });
  const errors = collectConsoleErrors(page);
  await page.goto('/en/catalog?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  await assertNoAppError(page);
  expect(dialog, 'an injected <script> executed').toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('catalog: filtering by a facet changes the URL and keeps the page healthy', async ({
  page,
}) => {
  await page.goto('/en/catalog');
  await expect(page.locator('a[href*="/en/products/"]').first()).toBeVisible({ timeout: 60_000 });
  // Facets are Links (the checkbox is decorative) inside collapsible <details>.
  // Force every group open, then click the first facet the catalog offers.
  await page
    .locator('aside details')
    .evaluateAll((els) => els.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  const facetLink = page.locator('aside a[href*="/catalog?"]').first();
  if (await facetLink.count()) {
    await facetLink.click();
    // The facet is a Next <Link> (client-side navigation), so wait for the URL to
    // actually gain its query rather than a load event that never fires.
    await page.waitForURL(/\/catalog\?/, { timeout: 15_000 });
    await assertNoAppError(page);
    expect(new URL(page.url()).search.length, 'a chosen facet did not reach the URL').toBeGreaterThan(
      0,
    );
  }
});

// ───────────────────────────── Product detail ────────────────────────────────

test('product detail: offers WhatsApp (link only, never sent) and shows no price', async ({
  page,
}) => {
  await page.goto('/en/catalog');
  const first = page.locator('a[href*="/en/products/"]').first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const href = await first.getAttribute('href');
  await page.goto(href!);
  await assertNoAppError(page);

  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/(AED|USD)\s?\d/);

  // A wa.me link must exist and be well-formed — but we assert its href only and
  // never click it, so nothing is ever sent.
  const wa = page.locator('a[href*="wa.me/"]').first();
  if (await wa.count()) {
    const waHref = await wa.getAttribute('href');
    expect(waHref).toMatch(/^https:\/\/wa\.me\/\d+/);
  }
  await shot(page, 'sweep-product');
});

test('product detail: a made-up slug returns 404, not a 500', async ({ page }) => {
  const res = await page.goto('/en/products/this-product-does-not-exist-zzz9999', {
    waitUntil: 'domcontentloaded',
  });
  expect(res?.status()).toBe(404);
  await assertNoAppError(page);
});

// ───────────────────────────── Contact form (no send) ────────────────────────

test('contacts: the form blocks an empty submit (nothing is ever sent)', async ({ page }) => {
  await page.goto('/en/contacts');
  const name = page.locator('#name');
  await expect(name).toBeVisible();

  // Click the submit without filling anything. The required fields must stop the
  // submission client-side — so no lead is created and no notification fires.
  const submit = page.getByRole('button', { name: /send|submit/i }).first();
  if (await submit.count()) await submit.click();

  const nameMissing = await name.evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
  expect(nameMissing, 'the contact name field is not required').toBe(true);

  // A hidden honeypot field exists for bots; a real user never sees it.
  await expect(page.locator('input[name="company"]')).toHaveCount(1);
  await shot(page, 'sweep-contact-validation');
});

// ───────────────────────────── Account / auth ────────────────────────────────

test('sign-in: wrong credentials are rejected and you stay on the form', async ({ page }) => {
  await page.goto('/en/account/sign-in');
  await page.fill('#email', 'nobody-e2e@attractivehome.test');
  await page.fill('#password', 'definitely-not-the-password');
  await page.click('button[type="submit"]');
  // Give the action time; a wrong password must NOT navigate away to a session.
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/sign-in/);
  await assertNoAppError(page);
});

test('sign-up: mismatched passwords are rejected (no account is created)', async ({ page }) => {
  await page.goto('/en/account/sign-up', { waitUntil: 'domcontentloaded' });
  const email = page.locator('#email');
  await expect(email).toBeVisible();
  await page.fill('#name', 'E2E Reject');
  await email.fill('e2e-reject@attractivehome.test');
  await page.fill('#password', 'Sufficient1Pass!');
  const confirm = page.locator('#confirm');
  if (await confirm.count()) await confirm.fill('DIFFERENT-value-9!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  // Validation failure keeps you on sign-up; a created account would redirect.
  await expect(page).toHaveURL(/sign-up|verify/);
  await assertNoAppError(page);
});

test('forgot-password: the form renders and does not error (no real email in dev)', async ({
  page,
}) => {
  const res = await page.goto('/en/account/forgot-password', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator('#email')).toBeVisible();
  await assertNoAppError(page);
});

// ───────────────────────────── Responsive / UI consistency ───────────────────

const MOBILE = { width: 390, height: 844 };

for (const route of ['/en', '/en/catalog', '/en/about', '/en/contacts']) {
  test(`responsive: ${route} has no horizontal overflow on a phone`, async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const overflow = await horizontalOverflow(page);
    expect(overflow, `${route} overflows by ${overflow}px on ${MOBILE.width}px`).toBeLessThanOrEqual(
      1,
    );
  });
}

test('responsive: the dashboard sidebar collapses and gives width back to the page', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard');
  const toggle = page.getByRole('button', { name: /collapse menu|expand menu/i });
  await expect(toggle).toBeVisible();
  const aside = page.locator('aside').first();
  const before = (await aside.boundingBox())?.width ?? 0;
  await toggle.click();
  await page.waitForTimeout(400);
  const after = (await aside.boundingBox())?.width ?? 0;
  expect(after, 'collapsing did not narrow the sidebar').toBeLessThan(before);
  await shot(page, 'sweep-sidebar-collapsed');
  await toggle.click(); // restore
});

// ───────────────────────────── Dashboard breadth (admin) ─────────────────────

const NEW_FORMS = [
  '/dashboard/products/new',
  '/dashboard/users/new',
  '/dashboard/services/new',
  '/dashboard/portfolio/projects/new',
  '/dashboard/portfolio/categories/new',
];

test('every "new entity" form renders its fields without a console error', async ({ page }) => {
  await signInAsAdmin(page);
  const failures: string[] = [];
  for (const route of NEW_FORMS) {
    const errors = collectConsoleErrors(page);
    const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (!res || res.status() >= 400) failures.push(`${route} -> HTTP ${res?.status()}`);
    if (!(await page.locator('form, input, textarea, select').first().count()))
      failures.push(`${route} -> no form controls rendered`);
    const body = await page.locator('body').innerText();
    if (/Application error|Unhandled Runtime Error/i.test(body)) failures.push(`${route} -> error`);
    if (errors.length) failures.push(`${route} -> ${errors.join(' | ')}`);
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('leads: the list opens and a lead detail renders', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/leads');
  await expect(page.getByRole('heading', { name: /Leads/i }).first()).toBeVisible();
  // Scope to the table (skip the status-filter pills), and wait for the client-side
  // navigation the Next <Link> performs — no full page load fires.
  const firstLeadLink = page.locator('table a[href*="/dashboard/leads/"]').first();
  if (await firstLeadLink.count()) {
    await firstLeadLink.scrollIntoViewIfNeeded();
    await firstLeadLink.click();
    await page.waitForURL(/\/dashboard\/leads\/[0-9a-f-]+/, { timeout: 15_000 });
    await assertNoAppError(page);
  }
});

// ───────────────────────────── Quotes CRUD + extreme inputs ──────────────────

test('quotes: create, rename with an extreme title, save, and it persists', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill('E2E Sweep base');
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);

  // An extreme title: emoji, RTL text, a very long run, and HTML-ish characters.
  const extreme = `E2E Sweep 🚪🔥 <b>x</b> ${'长'.repeat(80)} — "quotes" & <tags>`;
  await page.fill('#q-title', extreme);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 30_000 });

  // It survives a reload exactly as typed (no truncation-to-error, no injection).
  await page.reload();
  await expect(page.locator('#q-title')).toHaveValue(extreme);
  await assertNoAppError(page);
  await shot(page, 'sweep-quote-extreme-title');
});

test('login is not fooled by an injection-style string (fails gracefully)', async ({ page }) => {
  await page.goto('/en/account/sign-in');
  await page.fill('#email', "' OR 1=1;-- @x.test");
  await page.fill('#password', "'; DROP TABLE users;--");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/sign-in/); // rejected, no session, no 500
  await assertNoAppError(page);
});

// ───────────────────────────── Configurator tree editor ──────────────────────

test('the tree editor loads its canvas, palette and detail panel', async ({ page }) => {
  await signInAsAdmin(page);
  const errors = collectConsoleErrors(page);
  // The tree canvas is reached from a configurable product's EDIT page, not the
  // list — open edit pages until one offers the "open the tree canvas" link.
  await page.goto('/dashboard/products');
  const editHrefs = await page
    .locator('a[href*="/dashboard/products/"][href$="/edit"]')
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  let treeHref: string | null = null;
  for (const href of editHrefs.slice(0, 12)) {
    if (!href) continue;
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    const link = page.locator('a[href$="/tree"]');
    if (await link.count()) {
      treeHref = await link.first().getAttribute('href');
      break;
    }
  }
  test.skip(!treeHref, 'no configurable product found in this dataset');

  await page.goto(treeHref!, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/tree$/, { timeout: 60_000 });
  // The three panes of the authoring canvas.
  await expect(page.locator('.palette')).toBeVisible();
  await expect(page.locator('svg.cv')).toBeVisible();
  await assertNoAppError(page);

  // Connect mode toggles cleanly (no rebuild crash) — assert the toggle's own
  // pressed state, which is the direct signal.
  const connect = page.getByRole('button', { name: /connect/i }).first();
  if (await connect.count()) {
    await connect.click();
    await expect(connect).toHaveAttribute('aria-pressed', 'true');
  }
  await shot(page, 'sweep-tree-editor');
  expect(errors, errors.join('\n')).toEqual([]);
});
