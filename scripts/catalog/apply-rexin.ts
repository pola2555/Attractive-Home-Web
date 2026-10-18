// Apply the scraped Rexin décor data to the HPL/Laminate products.
// For each product (currently named just by its code, e.g. "91868"):
//   - readable EN name  = "<Family> <code>"   e.g. "Walnut 91868"
//   - look              = mapped from the family (Wood/Stone/Marble/...)
//   - collection        = the décor family itself ("shop by Walnut")
//   - size label        = the sheet sizes from the spec table (if missing)
//   - legacy_meta        += rexin texture/thickness
// Slugs are left untouched (stable URLs). Idempotent: re-running re-applies the
// same values. Reads the manifest produced by scrape-rexin.mjs.
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

const prisma = new PrismaClient();
const MANIFEST = process.argv[2]
  || 'C:/Users/polam/AppData/Local/Temp/claude/d--freelancing-projects-Attractive-Home-Web/3ab2c5fe-ab14-4dd8-bcf2-387c43aa1a9b/scratchpad/manifests/rexin.json';

const title = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase()).replace(/&Amp;/g, '&').trim();

// family keyword -> look code
function lookFor(fam: string): string {
  const f = fam.toUpperCase();
  const has = (...w: string[]) => w.some((x) => f.includes(x));
  if (has('SOLID COLOR', 'SOLID')) return 'Solid Color';
  if (has('WALNUT', 'OAK', 'TEAK', 'ELM', 'CHERRY', 'PEAR', 'SANDALWOOD', 'BAMBOO', 'WOOD', 'GRAIN', 'MAPLE', 'PINE', 'EBONY', 'ROSEWOOD')) return 'Wood';
  if (has('MARBLE', 'CALACATTA', 'CARRARA', 'MARMI', 'STATUARIO', 'ONYX', 'TRAVERTIN')) return 'Marble';
  if (has('METAL', 'STEEL', 'COPPER', 'BRONZE', 'GOLD', 'ALUMINI')) return 'Metal';
  if (has('GLASS')) return 'Glass / Mosaic';
  if (has('CEMENT', 'CONCRETE')) return 'Concrete / Cement';
  if (has('STOFFA', 'TASLON', 'FABRIC', 'LINEN', 'TEXTILE', 'WEAVE', 'CANVAS', 'JUTE')) return 'Fabric / Textile';
  if (has('LEATHER')) return 'Leather';
  if (has('ROCK', 'STONE', 'SAND', 'SLATE', 'GLACIER', 'SEDIMENT', 'QUICKSAND', 'GRANITE')) return 'Stone';
  return 'Pattern / Decor';
}

async function main() {
  const manifest: Record<string, any> = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const entries = Object.entries(manifest).filter(([, m]) => m.status === 'ok' && m.family);

  // look code -> id
  const looks = new Map(
    (await prisma.look.findMany({ select: { id: true, code: true } })).map((l) => [l.code, l.id]),
  );

  // ensure a collection per family
  const families = [...new Set(entries.map(([, m]) => title(m.family)))];
  const collId = new Map<string, string>();
  for (const fam of families) {
    const existing = await prisma.collection.findUnique({ where: { code: fam } });
    if (existing) { collId.set(fam, existing.id); continue; }
    const id = uuidv7();
    await prisma.collection.create({ data: { id, code: fam } });
    await prisma.collectionTranslation.create({
      data: { id: uuidv7(), collectionId: id, localeCode: 'en', name: fam },
    });
    collId.set(fam, id);
  }
  console.log(`collections ensured: ${families.length} families`);

  // products by legacyId
  const prods = await prisma.product.findMany({
    where: { legacyId: { in: entries.map(([id]) => id) } },
    select: { id: true, legacyId: true, code: true, sizeLabel: true, legacyMeta: true, lookId: true },
  });
  const byLegacy = new Map(prods.map((p) => [p.legacyId!, p]));

  let renamed = 0, lookSet = 0;
  const lookTally: Record<string, number> = {};
  let i = 0;
  for (const [legacyId, m] of entries) {
    const p = byLegacy.get(legacyId);
    if (!p) continue;
    const fam = title(m.family);
    const code = p.code || m.code || '';
    const name = code ? `${fam} ${code}` : fam;
    const lookCode = lookFor(m.family);
    const lookUuid = looks.get(lookCode) ?? null;
    lookTally[lookCode] = (lookTally[lookCode] || 0) + 1;

    const meta = {
      ...((p.legacyMeta as object) || {}),
      rexin_family: fam,
      rexin_texture: m.texture || undefined,
      rexin_thickness: m.thickness || undefined,
    };

    await prisma.productTranslation.updateMany({
      where: { productId: p.id, localeCode: 'en' },
      data: { name },
    });
    await prisma.product.update({
      where: { id: p.id },
      data: {
        lookId: lookUuid,
        collectionId: collId.get(fam) ?? null,
        sizeLabel: p.sizeLabel || m.sizes || null,
        legacyMeta: meta as Prisma.InputJsonValue,
      },
    });
    renamed++; if (lookUuid) lookSet++;
    if (++i % 200 === 0) console.log(`  ${i}/${entries.length}`);
  }

  console.log(`\nrenamed ${renamed} products, look set on ${lookSet}`);
  console.log('look distribution:', JSON.stringify(lookTally, null, 0));
}
main().finally(() => prisma.$disconnect());
