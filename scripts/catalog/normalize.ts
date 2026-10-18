// Catalog normalization — idempotent, re-runnable (dev now; prod later).
// Fixes the unambiguous facet mess surfaced in the Catalog Review:
//   1. "New Retail" type (60 Eagle tiles) -> "Ceramic Tile/Slab"; their
//      "Mixed" material -> "Ceramic / Porcelain".
//   2. Bad/duplicate materials: "Glossy" & "Straight Tube" are not materials;
//      "Slate" duplicates "Slate Stone"; crackle/pearlescent/glazed variants
//      fold into their base porcelain/ceramic.
// It does NOT touch the legitimate Porcelain / Ceramic / Ceramic-Porcelain
// split — that is a taxonomy decision for the client, not a data error.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const DRY = process.argv.includes('--dry');

async function idByCode(table: 'materials' | 'product_types', code: string) {
  const r = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM ${table} WHERE code = $1`,
    code,
  );
  return r[0]?.id as string | undefined;
}

async function main() {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    const run = async (sql: string, ...args: any[]) => {
      if (DRY) {
        const sel = sql.replace(/^UPDATE (\w+) SET .* WHERE/i, 'SELECT count(*)::int AS n FROM $1 WHERE');
        if (/^SELECT/i.test(sel)) {
          const r = await tx.$queryRawUnsafe<any[]>(sel, ...args);
          return r[0]?.n ?? 0;
        }
        return 0;
      }
      return tx.$executeRawUnsafe(sql, ...args);
    };

    // ---- 1. New Retail -> Ceramic Tile/Slab, Mixed -> Ceramic / Porcelain ----
    const newRetail = await idByCode('product_types', 'New Retail');
    const ceramicTile = await idByCode('product_types', 'Ceramic Tile/Slab');
    const mixed = await idByCode('materials', 'Mixed');
    const ceramicPorcelain = await idByCode('materials', 'Ceramic / Porcelain');

    if (newRetail && ceramicTile) {
      const n = await run(
        `UPDATE products SET type_id = $1::uuid WHERE type_id = $2::uuid`,
        ceramicTile, newRetail,
      );
      log.push(`type "New Retail" -> "Ceramic Tile/Slab": ${n} products`);
    }
    if (mixed && ceramicPorcelain) {
      const n = await run(
        `UPDATE products SET material_id = $1::uuid WHERE material_id = $2::uuid`,
        ceramicPorcelain, mixed,
      );
      log.push(`material "Mixed" -> "Ceramic / Porcelain": ${n} products`);
    }

    // ---- 2. material merges (from code -> to code) ----
    const merges: [string, string][] = [
      ['Slate', 'Slate Stone'],
      ['Crackle Porcelain', 'Porcelain'],
      ['Pearlescent Ceramic', 'Ceramic'],
      ['Glazed Ceramic', 'Ceramic'],
    ];
    for (const [from, to] of merges) {
      const fromId = await idByCode('materials', from);
      const toId = await idByCode('materials', to);
      if (fromId && toId) {
        const n = await run(
          `UPDATE products SET material_id = $1::uuid WHERE material_id = $2::uuid`,
          toId, fromId,
        );
        log.push(`material "${from}" -> "${to}": ${n} products`);
      }
    }

    // "Glossy" (a finish, not a material): tiles keep Ceramic/Porcelain, else NULL.
    const glossy = await idByCode('materials', 'Glossy');
    if (glossy && ceramicPorcelain) {
      const n1 = await run(
        `UPDATE products SET material_id = $1::uuid
         WHERE material_id = $2::uuid AND type_id IN (
           SELECT id FROM product_types WHERE code IN
           ('Ceramic Tile/Slab','Tile','Mosaic','Wall Panel','Flooring'))`,
        ceramicPorcelain, glossy,
      );
      const n2 = await run(
        `UPDATE products SET material_id = NULL WHERE material_id = $1::uuid`,
        glossy,
      );
      log.push(`material "Glossy" -> Ceramic/Porcelain for tiles (${n1}), else NULL (${n2})`);
    }
    // "Straight Tube": junk material -> NULL.
    const straight = await idByCode('materials', 'Straight Tube');
    if (straight) {
      const n = await run(`UPDATE products SET material_id = NULL WHERE material_id = $1::uuid`, straight);
      log.push(`material "Straight Tube" -> NULL: ${n} products`);
    }

    // ---- 3. delete now-orphaned facet rows (translations cascade) ----
    if (!DRY) {
      for (const code of ['Slate', 'Crackle Porcelain', 'Pearlescent Ceramic', 'Glazed Ceramic', 'Glossy', 'Straight Tube', 'Mixed']) {
        await tx.$executeRawUnsafe(
          `DELETE FROM materials m WHERE m.code = $1
             AND NOT EXISTS (SELECT 1 FROM products p WHERE p.material_id = m.id)`,
          code,
        );
      }
      await tx.$executeRawUnsafe(
        `DELETE FROM product_types t WHERE t.code = 'New Retail'
           AND NOT EXISTS (SELECT 1 FROM products p WHERE p.type_id = t.id)`,
      );
      log.push('deleted orphaned facet rows (New Retail, Mixed, Glossy, Straight Tube, Slate, 3 ceramic variants)');
    }
  });

  console.log((DRY ? '[DRY RUN]\n' : '') + log.join('\n'));

  // verify
  const mats = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS materials FROM materials`,
  );
  const types = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS types FROM product_types`,
  );
  const noMat = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS n FROM products WHERE material_id IS NULL`,
  );
  console.log(`\nafter: materials=${mats[0].materials}, types=${types[0].types}, products without material=${noMat[0].n}`);
}
main().finally(() => prisma.$disconnect());
