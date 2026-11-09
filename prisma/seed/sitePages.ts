import { uuidv7 } from 'uuidv7';
import type { PrismaClient } from '@prisma/client';
import { PAGE_REGISTRY } from '../../src/lib/sitePages';

// One SitePage row per public "outer" page. Idempotent: `update: {}` so
// re-running never clobbers an admin's visibility/label edits. The row only
// carries mutable flags — the page set, routes and the home-can't-be-hidden
// rule live in src/lib/sitePages.ts (the single source of truth).
export async function seedSitePages(prisma: PrismaClient): Promise<void> {
  for (const def of PAGE_REGISTRY) {
    await prisma.sitePage.upsert({
      where: { key: def.key },
      update: {},
      create: {
        id: uuidv7(),
        key: def.key,
        isPublished: true,
        showInNav: def.navEligible,
        showInFooter: def.footerEligible,
        navSortOrder: def.defaultNavOrder,
      },
    });
  }
  console.log(`  site pages: ${PAGE_REGISTRY.length} pages ensured`);
}
