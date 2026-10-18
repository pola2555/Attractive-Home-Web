// How certain are the "duplicates"? For each name+size+type group (>1), check
// whether members ALSO share the same supplier SKU code and the same primary
// image. Only matching-on-everything groups are safe to auto-merge.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const norm = (s: string) => (s || '').toLowerCase().trim();

async function main() {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p.legacy_id, pt.name, p.size_label, t.code AS type, p.code AS sku,
            p.supplier_url AS purl,
            (SELECT pi.supplier_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order LIMIT 1) AS img_url,
            (SELECT pi.s3_key     FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order LIMIT 1) AS img_key
     FROM products p
     JOIN product_translations pt ON pt.product_id=p.id AND pt.locale_code='en'
     LEFT JOIN product_types t ON t.id=p.type_id
     WHERE p.kind='stock'`);

  const g = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${norm(r.name)}||${norm(r.size_label || '')}||${r.type || ''}`;
    (g.get(k) ?? g.set(k, []).get(k)!).push(r);
  }

  let sets = 0, prod = 0;
  const tierA = { sets: 0, removable: 0 }; // same sku + same image  -> certain
  const tierB = { sets: 0, removable: 0 }; // same sku, diff image   -> very likely
  const tierC = { sets: 0, removable: 0 }; // diff sku               -> NOT safe
  const examplesC: any[] = [];
  const examplesB: any[] = [];

  for (const [, items] of g) {
    if (items.length < 2) continue;
    sets++; prod += items.length;
    const skus = new Set(items.map((i) => norm(i.sku || '')));
    const imgs = new Set(items.map((i) => norm(i.img_url || i.img_key || '')));
    const removable = items.length - 1;
    if (skus.size === 1 && imgs.size === 1) { tierA.sets++; tierA.removable += removable; }
    else if (skus.size === 1) { tierB.sets++; tierB.removable += removable;
      if (examplesB.length < 6) examplesB.push({ name: items[0].name, n: items.length, sku: [...skus][0], distinct_imgs: imgs.size }); }
    else { tierC.sets++; tierC.removable += removable;
      if (examplesC.length < 12) examplesC.push({ name: items[0].name, n: items.length, skus: [...skus].slice(0, 5).join(','), distinct_imgs: imgs.size, urls: items.slice(0,2).map((i:any)=>i.purl).join(' | ').slice(0,90) }); }
  }

  console.log(`groups: ${sets}, products in them: ${prod}\n`);
  console.log('TIER A  same name+size+type + SAME sku + SAME primary image  (certain duplicate)');
  console.log(`         ${tierA.sets} sets, ${tierA.removable} removable`);
  console.log('TIER B  same sku, DIFFERENT primary image                   (very likely dup / photo differs)');
  console.log(`         ${tierB.sets} sets, ${tierB.removable} removable`);
  console.log('TIER C  DIFFERENT sku codes — same name only                 (NOT safe — likely distinct products)');
  console.log(`         ${tierC.sets} sets, ${tierC.removable} would-be removable\n`);
  console.log('Tier C examples (do NOT auto-delete):');
  console.table(examplesC);
  console.log('Tier B examples:');
  console.table(examplesB);
}
main().finally(() => prisma.$disconnect());
