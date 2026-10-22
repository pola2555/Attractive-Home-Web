import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { collectConsoleErrors, signInAsAdmin } from './helpers';

// The visual tree editor must open for a canvas-built product and expose the
// size-band form (the new canvas size model the quote prices from).
test('tree editor opens and offers the size-band form', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  const prisma = new PrismaClient();
  const product = await prisma.product.findFirst({
    where: { template: { code: 'test_door' } },
    select: { id: true },
  });
  await prisma.$disconnect();
  expect(product).not.toBeNull();

  await signInAsAdmin(page);
  await page.goto(`/dashboard/products/${product!.id}/tree`);

  // The editor mounts: its palette (DOM, beside the canvas) lists this product's
  // add-ons, including the canvas size bands — confirming the new size model
  // surfaces in the editor.
  await expect(page.getByText('Your add-ons & colours', { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/Width 600.*900 mm/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
