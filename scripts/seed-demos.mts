import { PrismaClient } from '@prisma/client';
import { seedLanded } from '../prisma/seed/landed';
import { seedConfigurator } from '../prisma/seed/configurator';
import { seedBenison } from '../prisma/seed/benison';

// Surgical re-seed of just the two reference demo trees (the "door" template and
// the Benison Interior Door), after the dev DB was restocked to the real
// old-site catalog. Idempotent (upsert, update:{}), so it only adds the demo
// rows and never touches the 4276 real products or tuned settings. Benison now
// seeds unpublished, so it stays out of the public catalog.
//
// Landed reference data (HS codes, freight/storage rate cards) is seeded first,
// matching the canonical order in prisma/seed/index.ts: the door template links
// its duty rate (HS 4418.20) by code, so that row must exist before the
// configurator runs. This is pure reference data — it does NOT turn on the
// shipment/landed-cost UI, which stays gated behind SHIPMENT_ENABLED.
const prisma = new PrismaClient();

async function main() {
  await seedLanded(prisma);
  await seedConfigurator(prisma);
  console.log('seeded: door template');
  await seedBenison(prisma);
  console.log('seeded: Benison Interior Door (unpublished)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
