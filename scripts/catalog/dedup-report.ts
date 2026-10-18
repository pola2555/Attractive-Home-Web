// Read-only duplicate finder. Groups products by normalized EN name and
// classifies each multi-product group. Writes a reviewable JSON + a compact
// HTML table of the PURE-duplicate groups. Deletes nothing.
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const OUT_DIR = 'C:/Users/polam/AppData/Local/Temp/claude/d--freelancing-projects-Attractive-Home-Web/3ab2c5fe-ab14-4dd8-bcf2-387c43aa1a9b/scratchpad/manifests';

type Row = {
  legacy_id: string; name: string; size_label: string | null;
  type: string | null; source: string; imgs: number; first_key: string | null; slug: string;
};

const norm = (s: string) => (s || '').toLowerCase().trim();

async function main() {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT p.legacy_id, pt.name, p.size_label, t.code AS type, s.code AS source,
            (SELECT count(*)::int FROM product_images pi WHERE pi.product_id=p.id) AS imgs,
            (SELECT pi.s3_key FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order LIMIT 1) AS first_key,
            p.slug
     FROM products p
     JOIN product_translations pt ON pt.product_id=p.id AND pt.locale_code='en'
     LEFT JOIN product_types t ON t.id=p.type_id
     JOIN sources s ON s.id=p.source_id
     WHERE p.kind = 'stock'`,
  );

  // (a) EXACT duplicates: same name + same size + same type. Any such set >1
  //     is a true duplicate — keep one, remove the rest. (matches dedup-merge)
  const exact = new Map<string, Row[]>();
  // (b) SIZE VARIANTS: a name that spans >1 distinct size — collapse to options.
  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    const n = norm(r.name);
    if (!n) continue;
    const key = `${n}||${norm(r.size_label || '')}||${r.type || ''}`;
    (exact.get(key) ?? exact.set(key, []).get(key)!).push(r);
    (byName.get(n) ?? byName.set(n, []).get(n)!).push(r);
  }

  const pure: any[] = [];       // exact name+size+type duplicate sets
  for (const [, items] of exact) {
    if (items.length < 2) continue;
    pure.push({
      name: items[0].name, count: items.length,
      sizes: [norm(items[0].size_label || '')], types: [items[0].type || ''],
      members: items.map((i) => ({ id: i.legacy_id, size: i.size_label, type: i.type, imgs: i.imgs, slug: i.slug })),
    });
  }
  const variants: any[] = [];   // same name, differing size -> collapse to size options
  for (const [name, items] of byName) {
    const sizes = new Set(items.map((i) => norm(i.size_label || '')));
    if (sizes.size > 1) variants.push({
      name, count: items.length, sizes: [...sizes],
      members: items.map((i) => ({ id: i.legacy_id, size: i.size_label, type: i.type, imgs: i.imgs, slug: i.slug })),
    });
  }
  const review: any[] = [];

  const sortByCount = (a: any, b: any) => b.count - a.count;
  pure.sort(sortByCount); variants.sort(sortByCount);

  const sum = (a: any[]) => a.reduce((s, g) => s + g.count, 0);
  const summary = {
    exact_duplicate_sets: pure.length, products_in_exact: sum(pure),
    removable_if_merged: sum(pure) - pure.length,
    size_variant_names: variants.length, products_in_variants: sum(variants),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(`${OUT_DIR}/dedup-candidates.json`, JSON.stringify({ summary, pure, variants, review }, null, 1));

  // compact HTML of pure-dup groups (top 300) for eyeballing
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const trs = pure.slice(0, 300).map((g) =>
    `<tr><td>${esc(g.name)}</td><td style="text-align:right">${g.count}</td><td>${esc(g.types[0])}</td><td>${esc(g.sizes[0] || '—')}</td><td>${esc(g.members.map((m: any) => m.id).join(', '))}</td></tr>`,
  ).join('\n');
  fs.writeFileSync(`${OUT_DIR}/dedup-pure.html`,
    `<!doctype html><meta charset=utf8><title>Pure duplicates</title>
    <style>body{font:14px system-ui;margin:24px;color:#13293a}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e7e0d4;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f6edd8}td:nth-child(5){color:#6b7a88;font-size:12px}</style>
    <h2>Pure-duplicate groups (keep 1, remove the rest)</h2>
    <p>${pure.length} groups · ${summary.removable_if_merged} products removable. Showing top 300 by size.</p>
    <table><thead><tr><th>Name</th><th>Copies</th><th>Type</th><th>Size</th><th>Product IDs</th></tr></thead><tbody>${trs}</tbody></table>`);

  console.log(JSON.stringify(summary, null, 2));
  console.log('\nTop pure-duplicate groups:');
  console.table(pure.slice(0, 15).map((g) => ({ name: g.name, copies: g.count, type: g.types[0], size: g.sizes[0] })));
  console.log('\nTop size-variant groups:');
  console.table(variants.slice(0, 10).map((g) => ({ name: g.name, count: g.count, sizes: g.sizes.join(' | ').slice(0, 50) })));
  console.log(`\nWrote ${OUT_DIR}/dedup-candidates.json and dedup-pure.html`);
}
main().finally(() => prisma.$disconnect());
