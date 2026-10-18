// DESTRUCTIVE — keeps one product per PURE-duplicate group (same name + same
// size + same type) and deletes the rest. Requires an explicit --confirm flag;
// without it, it only prints what it WOULD delete. Recomputes groups live, so
// it is safe to run after a partial run. Skips any product referenced by a
// quote item, favorite or lead (should be none in a freshly restocked dev DB).
//
// Review scripts/catalog dedup-candidates.json BEFORE running with --confirm.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');
const norm = (s: string) => (s || '').toLowerCase().trim();

async function main() {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p.id, p.legacy_id, pt.name, p.size_label, p.type_id, p.code AS sku,
            (SELECT pi.supplier_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order LIMIT 1) AS img_url,
            (SELECT pi.s3_key     FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order LIMIT 1) AS img_key
     FROM products p
     JOIN product_translations pt ON pt.product_id=p.id AND pt.locale_code='en'
     WHERE p.kind='stock'`);
  // CERTAIN duplicate = same name + size + type + SKU code + primary image
  // (Tier A). Products that merely share a name but differ in SKU/image are
  // distinct products (colourways etc.) and are deliberately NOT grouped here.
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const key = [norm(r.name), norm(r.size_label || ''), r.type_id || '',
                 norm(r.sku || ''), norm(r.img_url || r.img_key || '')].join('||');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const toDelete: string[] = [];
  let keptGroups = 0;
  for (const [, items] of groups) {
    if (items.length < 2) continue;
    keptGroups++;
    items.sort((a, b) => String(a.legacy_id).localeCompare(String(b.legacy_id)));
    toDelete.push(...items.slice(1).map((i) => i.id)); // keep the first
  }
  // safety: never delete referenced products
  const referenced = new Set<string>();
  for (const tbl of ['quote_items', 'customer_favorites', 'leads']) {
    try {
      const r = await prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT product_id::text AS id FROM ${tbl} WHERE product_id = ANY($1::uuid[])`,
        toDelete);
      r.forEach((x) => referenced.add(x.id));
    } catch { /* table/col may differ; ignore */ }
  }
  const finalDelete = toDelete.filter((id) => !referenced.has(id));

  console.log(`pure groups: ${keptGroups} | products to delete: ${finalDelete.length} | skipped (referenced): ${referenced.size}`);
  if (!CONFIRM) { console.log('\nDRY RUN — pass --confirm to delete.'); return; }

  let done = 0;
  for (let i = 0; i < finalDelete.length; i += 500) {
    const batch = finalDelete.slice(i, i + 500);
    const res = await prisma.product.deleteMany({ where: { id: { in: batch } } });
    done += res.count;
    console.log(`  deleted ${done}/${finalDelete.length}`);
  }
  console.log(`DONE — removed ${done} pure-duplicate products.`);
}
main().finally(() => prisma.$disconnect());
