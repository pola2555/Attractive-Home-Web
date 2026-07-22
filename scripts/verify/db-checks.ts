// End-to-end database verification — docs/DATABASE.md §12 (items 3–6).
// Items 1–2 (migrate/validate, import counts, idempotent re-run) are covered
// by `prisma migrate dev` + `npm run import:data`. Re-runnable; cleans up the
// temporary rows it creates. SES notification (§12.6) and JWT invalidation on
// security_stamp rotation (§12.5) are app-phase behaviors, noted as SKIP.
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

const prisma = new PrismaClient();

let failures = 0;
function report(ok: boolean, label: string, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// §4 — effective permission = deny override > allow override > union of role
// permissions. This mirrors the documented helper that will live in app code.
async function effectivePermissions(userId: string): Promise<Set<string>> {
  const [rolePerms, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role: { userRoles: { some: { userId } } } },
      select: { permission: { select: { slug: true } } },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { effect: true, permission: { select: { slug: true } } },
    }),
  ]);
  const effective = new Set(rolePerms.map((rp) => rp.permission.slug));
  for (const o of overrides) if (o.effect === 'allow') effective.add(o.permission.slug);
  for (const o of overrides) if (o.effect === 'deny') effective.delete(o.permission.slug);
  return effective;
}

async function spotChecks() {
  console.log('§12.3 spot checks:');

  // P00501 has 5 name rows incl. zh.
  const p501 = await prisma.product.findUnique({
    where: { legacyId: 'P00501' },
    include: { translations: { select: { localeCode: true } } },
  });
  const locales = (p501?.translations ?? []).map((t) => t.localeCode).sort();
  report(
    locales.length === 5 && locales.includes('zh'),
    'P00501 has 5 name rows incl. zh',
    locales.join(','),
  );

  // A bare-SKU product has ONLY an en row whose name is the code — every
  // language renders the SKU via the [requested,'en'] fallback chain (§3).
  const bareRows = await prisma.$queryRaw<{ legacy_id: string; code: string; n: bigint }[]>`
    SELECT p.legacy_id, p.code, COUNT(*) OVER ()::bigint AS n
    FROM products p
    JOIN product_translations pt ON pt.product_id = p.id AND pt.locale_code = 'en'
    WHERE pt.name = p.code
      AND NOT EXISTS (
        SELECT 1 FROM product_translations x
        WHERE x.product_id = p.id AND x.locale_code <> 'en')
    LIMIT 1`;
  report(
    bareRows.length === 1,
    'bare-SKU products fall back to their code in all locales',
    bareRows.length
      ? `${Number(bareRows[0].n)} such products, e.g. ${bareRows[0].legacy_id} (${bareRows[0].code})`
      : 'none found',
  );

  // A sectioned project's media resolve to its own sections.
  const sectioned = await prisma.project.findFirst({
    where: { sections: { some: {} } },
    include: {
      sections: { select: { id: true } },
      media: { select: { sectionId: true } },
    },
  });
  const sectionIds = new Set(sectioned?.sections.map((s) => s.id) ?? []);
  const claimed = (sectioned?.media ?? []).filter((m) => m.sectionId !== null);
  report(
    sectioned !== null &&
      claimed.length > 0 &&
      claimed.every((m) => sectionIds.has(m.sectionId as string)),
    'sectioned project media resolve to its own sections',
    sectioned
      ? `${sectioned.legacyId}: ${claimed.length}/${sectioned.media.length} media in ${sectionIds.size} sections`
      : '',
  );

  // Deleting locale 'en' must be blocked by RESTRICT FKs. Postgres raises
  // SQLSTATE 23001 (restrict_violation), which Prisma surfaces as an unknown
  // request error rather than P2003 (23503) — accept either.
  try {
    await prisma.locale.delete({ where: { code: 'en' } });
    report(false, "locale 'en' deletion blocked by RESTRICT", 'delete unexpectedly succeeded');
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = String((error as { message?: string }).message ?? '');
    report(
      code === 'P2003' || message.includes('23001') || message.includes('RESTRICT'),
      "locale 'en' deletion blocked by RESTRICT",
      code ? `error code ${code}` : 'SQLSTATE 23001 restrict_violation',
    );
  }
}

async function queryDrills() {
  console.log('§12.4 query drills:');

  // Faceted count per facet FK on published products.
  let t0 = performance.now();
  await prisma.product.groupBy({
    by: ['typeId'],
    where: { isPublished: true },
    _count: { _all: true },
  });
  const facetMs = performance.now() - t0;
  report(facetMs < 50, 'faceted count query < 50 ms', `${facetMs.toFixed(1)} ms`);

  // Trigram search for 'madrid' across all four public locales — each in its
  // own script ('madrid' Latin, 'мадрид' Cyrillic, 'مدريد' Arabic), all
  // served by the single GIN index on product_translations.name.
  t0 = performance.now();
  const rows = await prisma.$queryRaw<{ locale_code: string; n: bigint }[]>`
    SELECT locale_code, COUNT(*)::bigint AS n
    FROM product_translations
    WHERE (name ILIKE '%madrid%' OR name ILIKE '%мадрид%' OR name ILIKE '%مدريد%')
      AND locale_code IN ('en','ar','fr','ru')
    GROUP BY locale_code`;
  const searchMs = performance.now() - t0;
  const found = Object.fromEntries(rows.map((r) => [r.locale_code, Number(r.n)]));
  report(
    ['en', 'ar', 'fr', 'ru'].every((l) => (found[l] ?? 0) > 0),
    "trigram search 'madrid' returns across en/ar/fr/ru",
    `${JSON.stringify(found)} in ${searchMs.toFixed(1)} ms`,
  );

  // Contextual facet counts for one known filter combo (type + color set).
  t0 = performance.now();
  const ceramic = await prisma.productType.findUnique({ where: { code: 'Ceramic Tile/Slab' } });
  const counts = await prisma.product.groupBy({
    by: ['colorId'],
    where: { isPublished: true, typeId: ceramic?.id },
    _count: { _all: true },
  });
  const ctxMs = performance.now() - t0;
  const total = counts.reduce((n, c) => n + c._count._all, 0);
  report(
    total === 1589,
    'contextual counts match the old UI (Ceramic Tile/Slab = 1,589)',
    `${total} products across ${counts.length} colors in ${ctxMs.toFixed(1)} ms`,
  );
}

async function rbacChecks() {
  console.log('§12.5 RBAC:');
  const email = 'verify-temp@example.invalid';
  await prisma.user.deleteMany({ where: { email } }); // stale runs
  const dataEntry = await prisma.role.findUniqueOrThrow({ where: { slug: 'data-entry' } });
  const catalogWrite = await prisma.permission.findUniqueOrThrow({
    where: { slug: 'catalog.write' },
  });
  const user = await prisma.user.create({
    data: {
      id: uuidv7(),
      email,
      passwordHash: 'not-a-real-hash',
      name: 'Verification Temp User',
      securityStamp: uuidv7(),
      userRoles: { create: { roleId: dataEntry.id } },
    },
  });
  try {
    let perms = await effectivePermissions(user.id);
    report(
      perms.has('catalog.write') && perms.has('portfolio.write') && perms.has('content.write'),
      'data-entry role grants catalog/portfolio/content write',
      [...perms].sort().join(','),
    );
    report(!perms.has('users.manage'), 'data-entry user rejected from users.manage');

    await prisma.userPermissionOverride.create({
      data: { userId: user.id, permissionId: catalogWrite.id, effect: 'deny' },
    });
    perms = await effectivePermissions(user.id);
    report(
      !perms.has('catalog.write') && perms.has('portfolio.write'),
      'deny override beats the role grant (catalog.write removed, others intact)',
    );
    console.log('  SKIP  security_stamp rotation invalidating JWTs — app-phase (Auth.js) behavior');
  } finally {
    await prisma.user.delete({ where: { id: user.id } }); // cascades role + override
  }
}

async function leadChecks() {
  console.log('§12.6 lead flow:');
  const product = await prisma.product.findUnique({ where: { legacyId: 'P00501' } });
  const lead = await prisma.lead.create({
    data: {
      id: uuidv7(),
      name: 'Verification Temp Lead',
      phone: '+971 50 0000000',
      localeCode: 'en',
      productId: product?.id,
    },
  });
  try {
    report(
      lead.status === 'new' && lead.channel === 'contact_form',
      "inserted lead stored with status 'new' / channel 'contact_form'",
    );
    console.log('  SKIP  SES notification to settings[leads.notify_emails] — app-phase behavior');
  } finally {
    await prisma.lead.delete({ where: { id: lead.id } });
  }
}

async function main() {
  await spotChecks();
  await queryDrills();
  await rbacChecks();
  await leadChecks();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
