import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function tallyFacet(table: string, join: string, col: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT f.code, count(p.id)::int AS n
     FROM ${table} f LEFT JOIN products p ON p.${col} = f.id
     GROUP BY f.code ORDER BY n DESC`,
  );
  return rows;
}

async function main() {
  console.log('=== MATERIALS ===');
  console.table(await tallyFacet('materials', '', 'material_id'));

  console.log('=== FINISHES ===');
  console.table(await tallyFacet('finishes', '', 'finish_id'));

  console.log('=== LOOKS ===');
  console.table(await tallyFacet('looks', '', 'look_id'));

  console.log('=== PRODUCT TYPES ===');
  console.table(await tallyFacet('product_types', '', 'type_id'));

  console.log('=== APPLICATIONS (room/use) ===');
  console.table(
    await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.code, count(pa.product_id)::int AS n
       FROM applications a LEFT JOIN product_applications pa ON pa.application_id=a.id
       GROUP BY a.code ORDER BY n DESC`,
    ),
  );

  const collCount = await prisma.collection.count();
  console.log('collections total:', collCount);

  // New Retail bucket — what else do we know about these 60?
  console.log('=== "New Retail" products: their source + material + apps ===');
  console.table(
    await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.code AS source, m.code AS material, count(*)::int AS n
       FROM products p JOIN product_types t ON t.id=p.type_id AND t.code='New Retail'
       JOIN sources s ON s.id=p.source_id
       LEFT JOIN materials m ON m.id=p.material_id
       GROUP BY s.code, m.code ORDER BY n DESC`,
    ),
  );
  // a few sample New Retail names + urls
  console.log('New Retail samples:');
  console.table(
    await prisma.$queryRawUnsafe<any[]>(
      `SELECT p.legacy_id, pt.name, p.supplier_url
       FROM products p JOIN product_types t ON t.id=p.type_id AND t.code='New Retail'
       JOIN product_translations pt ON pt.product_id=p.id AND pt.locale_code='en'
       LIMIT 12`,
    ),
  );
}
main().finally(() => prisma.$disconnect());
