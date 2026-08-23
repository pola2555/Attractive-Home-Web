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

// Configurator / quotes / landed cost — the hand-written SQL in migration 3,
// which Prisma cannot express and therefore cannot verify for us.
async function quotingChecks() {
  console.log('\nconfigurator + quotes:');

  const template = await prisma.configTemplate.findUnique({ where: { code: 'door' } });
  report(!!template, "seeded 'door' template exists");
  if (!template) return;

  // The XOR that stops a rule silently applying twice.
  const product = await prisma.product.findFirst({ select: { id: true } });
  let xorFired = false;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO pricing_rules (id, template_id, product_id, code, stage, priority, basis, apply_per, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'both_set', 'base', 1, 'flat', 'unit', true, now(), now())`,
      uuidv7(),
      template.id,
      product?.id ?? template.id,
    );
  } catch (error) {
    xorFired = String(error).includes('pricing_rules_scope_check');
  }
  report(xorFired, 'pricing_rules XOR scope CHECK rejects template_id AND product_id');

  // A rule scoped to neither must fail the same way.
  let nullFired = false;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO pricing_rules (id, code, stage, priority, basis, apply_per, is_active, created_at, updated_at)
       VALUES ($1::uuid, 'neither_set', 'base', 1, 'flat', 'unit', true, now(), now())`,
      uuidv7(),
    );
  } catch (error) {
    nullFired = String(error).includes('pricing_rules_scope_check');
  }
  report(nullFired, 'pricing_rules XOR scope CHECK rejects an unscoped rule');

  // Reference generation must not depend on MAX()+1.
  const seq = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT nextval('quote_reference_seq')::text AS n`,
  );
  report(Number(seq[0]?.n) > 0, 'quote_reference_seq issues references', `nextval=${seq[0]?.n}`);

  // A nonsense duty rate must not be storable.
  let dutyFired = false;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO hs_codes (id, code, description, duty_percent, vat_percent, is_active, created_at, updated_at)
       VALUES ($1::uuid, 'BAD.01', 'bad rate', 900, 5, true, now(), now())`,
      uuidv7(),
    );
  } catch (error) {
    dutyFired = String(error).includes('hs_codes_duty_percent_check');
  }
  report(dutyFired, 'hs_codes duty_percent CHECK rejects 900%');

  // The tree, the constraint and the chained formulas all made it in.
  const options = await prisma.configTemplateOption.count({ where: { templateId: template.id } });
  report(options === 8, "'door' template binds 8 option groups", `found ${options}`);

  const gated = await prisma.configTemplateOptionValue.count({
    where: { templateOption: { templateId: template.id }, NOT: { condition: { equals: null } } },
  });
  report(gated > 0, 'at least one option value is gated by a condition', `found ${gated}`);

  const ranged = await prisma.configTemplateOption.count({
    where: { templateId: template.id, NOT: { ranges: { equals: null } } },
  });
  report(ranged >= 3, 'conditional numeric ranges present', `found ${ranged}`);

  const constraints = await prisma.configTemplateConstraint.count({
    where: { templateId: template.id },
  });
  report(constraints >= 1, 'cross-group constraint present', `found ${constraints}`);

  const derived = await prisma.configDerivedQuantity.findMany({
    where: { templateId: template.id },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, formula: true, sortOrder: true },
  });
  report(
    derived.length === 3,
    'three chained derived quantities',
    derived.map((d) => d.code).join(' -> '),
  );

  // The DAG rule the save action enforces: a formula may only look backwards.
  const seen = new Set<string>();
  let forwardRef = false;
  for (const quantity of derived) {
    for (const other of derived) {
      if (other.code === quantity.code) continue;
      const referenced = new RegExp(`\\b${other.code}\\b`).test(quantity.formula);
      if (referenced && !seen.has(other.code)) forwardRef = true;
    }
    seen.add(quantity.code);
  }
  report(!forwardRef, 'no derived quantity references a later one (DAG holds)');

  // The security boundary: data-entry must not reach cost basis.
  const dataEntry = await prisma.role.findUnique({
    where: { slug: 'data-entry' },
    select: { rolePermissions: { select: { permission: { select: { slug: true } } } } },
  });
  const dataEntrySlugs = new Set(dataEntry?.rolePermissions.map((rp) => rp.permission.slug) ?? []);
  report(
    !dataEntrySlugs.has('pricing.write') && !dataEntrySlugs.has('quotes.read'),
    'data-entry role cannot see pricing or quotes',
  );

  const sales = await prisma.role.findUnique({
    where: { slug: 'sales' },
    select: { rolePermissions: { select: { permission: { select: { slug: true } } } } },
  });
  const salesSlugs = new Set(sales?.rolePermissions.map((rp) => rp.permission.slug) ?? []);
  report(
    salesSlugs.has('quotes.write') && !salesSlugs.has('pricing.write'),
    'sales role can quote but cannot edit pricing rules',
  );

  await prisma.pricingRule.deleteMany({ where: { code: { in: ['both_set', 'neither_set'] } } });
  await prisma.hsCode.deleteMany({ where: { code: 'BAD.01' } });
}

async function main() {
  await spotChecks();
  await queryDrills();
  await rbacChecks();
  await leadChecks();
  await quotingChecks();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
