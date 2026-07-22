// One-time JSON import orchestrator — docs/DATABASE.md §8. Runs steps 01–05
// in order, then prints the §8 step 10 verification report comparing DB state
// against the source files AND the fixed counts from the plan. Exits non-zero
// on any mismatch. Idempotent: re-running produces zero new rows.
import { prisma, readJson, trimmed } from './lib';
import { importFacets } from './01-facets';
import { importProducts } from './02-products';
import { importPortfolio } from './03-portfolio';
import { importSampleRooms } from './04-sample-rooms';
import { importServices } from './05-services';

// Fixed expectations from docs/DATABASE.md §8 step 10 / §12.
const PLAN = {
  products: 4276,
  zhNames: 1695,
  frRuProducts: 2507,
  descProducts: 2136,
  usageProducts: 626,
  projects: 41,
  services: 12,
};

type FullFile = {
  products: {
    name: { zh?: string };
    desc?: { en?: string; ar?: string };
    use?: { en?: string; ar?: string };
    images?: unknown[];
  }[];
};
type ListingFile = { products: { tf?: string; tr?: string; t?: string }[] };

let failures = 0;
function check(label: string, actual: number | bigint, expected: number) {
  const a = Number(actual);
  const ok = a === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${a} (expected ${expected})`);
}

async function main() {
  const started = Date.now();

  const facets = await importFacets();
  const products = await importProducts();
  const portfolio = await importPortfolio();
  await importSampleRooms();
  const services = await importServices();

  console.log('\nVerification report — docs/DATABASE.md §8 step 10:');

  // Source-derived expectations (independent recount from the data files).
  const full = readJson<FullFile>('catalog/products.json');
  const listing = readJson<ListingFile>('catalog/catalog-listing.json');
  const srcZh = full.products.filter((p) => trimmed(p.name.zh)).length;
  const srcDesc = full.products.filter((p) => trimmed(p.desc?.en) || trimmed(p.desc?.ar)).length;
  const srcUse = full.products.filter((p) => trimmed(p.use?.en) || trimmed(p.use?.ar)).length;
  const srcFrRu = listing.products.filter(
    (p) => (trimmed(p.tf) && trimmed(p.tf) !== trimmed(p.t)) || (trimmed(p.tr) && trimmed(p.tr) !== trimmed(p.t)),
  ).length;
  const srcImages = full.products.reduce((n, p) => n + (p.images?.length ?? 0), 0);

  const [dbProducts, dbProjects, dbImages, dbMedia, dbServices] = await Promise.all([
    prisma.product.count(),
    prisma.project.count(),
    prisma.productImage.count(),
    prisma.projectMedia.count(),
    prisma.service.count(),
  ]);
  const dbZh = await prisma.productTranslation.count({ where: { localeCode: 'zh' } });
  const [{ n: dbFrRu }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT product_id)::bigint AS n FROM product_translations WHERE locale_code IN ('fr','ru')`;
  const [{ n: dbDesc }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT product_id)::bigint AS n FROM product_translations WHERE description IS NOT NULL`;
  const [{ n: dbUse }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT product_id)::bigint AS n FROM product_translations WHERE usage_notes IS NOT NULL`;

  check('products', dbProducts, PLAN.products);
  check('products (source file)', full.products.length, PLAN.products);
  check('zh name rows', dbZh, PLAN.zhNames);
  check('zh name rows (source file)', srcZh, PLAN.zhNames);
  check('products with fr/ru names', dbFrRu, PLAN.frRuProducts);
  check('products with fr/ru names (source file)', srcFrRu, PLAN.frRuProducts);
  check('products with description', dbDesc, PLAN.descProducts);
  check('products with description (source file)', srcDesc, PLAN.descProducts);
  check('products with usage notes', dbUse, PLAN.usageProducts);
  check('products with usage notes (source file)', srcUse, PLAN.usageProducts);
  check('product images', dbImages, srcImages);
  check('projects', dbProjects, PLAN.projects);
  check('project media', dbMedia, portfolio.media);
  check('services', dbServices, PLAN.services);

  console.log('\n  facet vocabularies:', JSON.stringify(facets.vocabularies));
  console.log('  alias-map hits:', JSON.stringify(products.aliasHits));
  console.log(
    '  slug-suffixed:',
    products.slugSuffixed.length ? products.slugSuffixed.join(', ') : '(none)',
  );
  console.log(`  services translation rows: ${services.translations}`);
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s — ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
