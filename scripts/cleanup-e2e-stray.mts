import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Remove stray E2E artefacts the test teardown doesn't cover: customers (teardown
// only removes E2E staff users) and throwaway E2E tree products/templates left by
// an interrupted run (e.g. "E2E Tree Stress …"). Never touches real catalog data.
async function main() {
  const cust = await prisma.customer.deleteMany({
    where: { email: { in: ['e2e-reject@attractivehome.test'] } },
  });
  console.log('deleted stray customers:', cust.count);

  // Products whose English name starts with "E2E " (throwaway tree products).
  const strayProducts = await prisma.product.findMany({
    where: {
      kind: 'made_to_order',
      translations: { some: { name: { startsWith: 'E2E ' } } },
    },
    select: { id: true, slug: true, translations: { where: { localeCode: 'en' }, select: { name: true } } },
  });
  for (const p of strayProducts) {
    console.log('  deleting product:', p.translations[0]?.name ?? p.slug);
  }
  if (strayProducts.length) {
    await prisma.product.deleteMany({ where: { id: { in: strayProducts.map((p) => p.id) } } });
  }

  // Config templates named "E2E …" with no remaining product.
  const strayTemplates = await prisma.configTemplate.deleteMany({
    where: { name: { startsWith: 'E2E ' } },
  });
  console.log('deleted stray templates:', strayTemplates.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
