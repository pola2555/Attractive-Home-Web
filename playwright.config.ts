import { defineConfig, devices } from '@playwright/test';
// Playwright does not read .env the way Next does, and the dashboard specs need
// ADMIN_EMAIL / ADMIN_PASSWORD to sign in.
import 'dotenv/config';

// End-to-end verification against a real dev server. These tests drive the
// configurator, the quote assembly page and the landed-cost roll-up the way a
// person does — the unit tests in src/lib prove the maths, these prove the
// wiring.

const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: './e2e',
  // Sequential: the specs share one database and build on each other's state
  // (sign in -> create a quote -> configure it -> cost it).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  outputDir: process.env.E2E_OUTPUT_DIR ?? './e2e/.output',

  use: {
    baseURL: `http://localhost:${PORT}`,
    // The first compile of a Turbopack route is slow; a short action timeout
    // produces flakes that look like product bugs.
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}/dashboard/quotes`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
