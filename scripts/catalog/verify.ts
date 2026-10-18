import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p.code, pt.name, l.code AS look, c.code AS collection, p.size_label
     FROM products p
     JOIN product_translations pt ON pt.product_id=p.id AND pt.locale_code='en'
     LEFT JOIN looks l ON l.id=p.look_id
     LEFT JOIN collections c ON c.id=p.collection_id
     WHERE p.supplier_url LIKE '%rexinhpl%'
     ORDER BY random() LIMIT 12`,
  );
  console.table(rows);
  const looksNow = await prisma.$queryRawUnsafe<any[]>(
    `SELECT l.code, count(p.id)::int n FROM looks l LEFT JOIN products p ON p.look_id=l.id GROUP BY l.code ORDER BY n DESC`,
  );
  console.log('LOOKS now:'); console.table(looksNow);
  console.log('collections total now:', await prisma.collection.count());
  await prisma.$disconnect();
})();
