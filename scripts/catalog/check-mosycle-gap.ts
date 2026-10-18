import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const manifest: Record<string, any> = JSON.parse(fs.readFileSync(
  'C:/Users/polam/AppData/Local/Temp/claude/d--freelancing-projects-Attractive-Home-Web/3ab2c5fe-ab14-4dd8-bcf2-387c43aa1a9b/scratchpad/manifests/mosycle.json', 'utf8'));
(async () => {
  // our attractivehome products with their stored image count + slug (=shopify handle)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p.slug, (SELECT count(*)::int FROM product_images pi WHERE pi.product_id=p.id) AS have
     FROM products p JOIN sources s ON s.id=p.source_id AND s.code='attractivehome'`);
  let gapProducts = 0, gapImages = 0, oneImgNowMulti = 0, matched = 0, unmatched = 0;
  for (const r of rows) {
    const m = manifest[r.slug];
    if (!m) { unmatched++; continue; }
    matched++;
    const live = m.image_count || 0;
    if (live > r.have) { gapProducts++; gapImages += (live - r.have); if (r.have === 1) oneImgNowMulti++; }
  }
  console.log({ total: rows.length, matched, unmatched, gapProducts, gapImages, oneImgNowMulti });
  await prisma.$disconnect();
})();
