import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { E2E_PASSWORD, E2E_USERS } from './fixtures';
import path from 'node:path';

// Screenshots land in the scratchpad by default so they never pollute the repo.
export const SHOTS = process.env.E2E_SHOTS ?? path.join(process.cwd(), 'e2e', '.shots');

export function shotPath(name: string): string {
  fs.mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, `${name}.png`);
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: shotPath(name), fullPage: true });
}

// Staff sign in through the single site-wide form; /dashboard/login is only a
// redirect to it (see src/app/dashboard/login/page.tsx). A successful staff
// sign-in lands on the locale home page, not the dashboard.
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/en/account/sign-in');
  await page.fill('#email', email);
  await page.fill('#password', E2E_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await signIn(page, E2E_USERS.admin.email);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
}

// Console errors are collected per test rather than asserted inline, so one
// noisy page does not mask a real error on the next.
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Next's dev overlay and the sandbox's blocked Google Fonts fetch are
    // environmental, not defects in this code.
    if (/favicon|Failed to fetch .*fonts|net::ERR_/i.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** The label of every option currently offered by a configurator select. */
export async function optionLabels(page: Page, groupCode: string): Promise<string[]> {
  return page.locator(`#cfg-${groupCode} option`).allTextContents();
}

/** Whether a specific configurator option is selectable right now. */
export async function optionState(
  page: Page,
  groupCode: string,
  valueLabel: string,
): Promise<'available' | 'pending' | 'blocked' | 'absent'> {
  const options = await optionLabels(page, groupCode);
  const match = options.find((label) => label.startsWith(valueLabel));
  if (!match) return 'absent';
  if (match.includes('choose earlier options first')) return 'pending';
  if (match.includes('not available')) return 'blocked';
  return 'available';
}
