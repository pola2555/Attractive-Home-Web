import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { shot, signInAsAdmin } from './helpers';

// Soft-delete: deleting a quote moves it to the Trash (kept 30 days), where it
// can be Restored or deleted forever. The inbox never shows a trashed quote.

const STAMP = Date.now();
const TITLE = `E2E Trash ${STAMP}`;

async function createQuote(page: Page): Promise<void> {
  await page.goto('/dashboard/quotes');
  await page.getByRole('button', { name: 'New quote' }).click();
  await page.getByPlaceholder('Quote title (optional)').fill(TITLE);
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 60_000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ]);
}

const inboxRow = (page: Page) => page.locator('tr', { hasText: TITLE });

test('a quote soft-deletes to the Trash, restores, and deletes forever', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAsAdmin(page);
  await createQuote(page);

  // Delete from the inbox row → it leaves the inbox.
  await page.goto('/dashboard/quotes');
  await expect(inboxRow(page)).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes(\?|$)/, { timeout: 60_000 }),
    inboxRow(page).getByRole('button', { name: 'Delete' }).click(),
  ]);
  await expect(inboxRow(page)).toHaveCount(0);

  // It is in the Trash, with time left and a Restore action.
  await page.goto('/dashboard/quotes?trash=1');
  await expect(inboxRow(page)).toBeVisible();
  await expect(inboxRow(page).getByText(/d left|expires today/)).toBeVisible();
  await shot(page, 'quote-trash-01');

  // Restore → back in the inbox, gone from the Trash.
  await inboxRow(page).getByRole('button', { name: 'Restore' }).click();
  await expect(inboxRow(page)).toHaveCount(0);
  await page.goto('/dashboard/quotes');
  await expect(inboxRow(page)).toBeVisible();

  // Delete again, then delete forever from the Trash (two-step in-UI confirm).
  await Promise.all([
    page.waitForURL(/\/dashboard\/quotes(\?|$)/, { timeout: 60_000 }),
    inboxRow(page).getByRole('button', { name: 'Delete' }).click(),
  ]);
  await page.goto('/dashboard/quotes?trash=1');
  await inboxRow(page).getByRole('button', { name: 'Delete forever' }).click();
  await inboxRow(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(inboxRow(page)).toHaveCount(0);
});

test.afterAll(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.quote.deleteMany({ where: { title: { startsWith: 'E2E Trash ' } } });
  } finally {
    await prisma.$disconnect();
  }
});
