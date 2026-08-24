// Runtime seed — docs/DATABASE.md §9. Idempotent: every write is an upsert
// keyed by a natural id with `update: {}`, so re-running never duplicates
// rows or clobbers later admin edits.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedLocales } from './locales';
import { seedRbac, seedAdminUser } from './rbac';
import { seedSettings } from './settings';
import { seedContentBlocks } from './content-blocks';
import { seedLanded } from './landed';
import { seedConfigurator } from './configurator';
import { seedBenison } from './benison';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database (idempotent)…');
  await seedLocales(prisma);
  await seedRbac(prisma);
  await seedAdminUser(prisma);
  await seedSettings(prisma);
  await seedContentBlocks(prisma);
  await seedLanded(prisma);
  await seedConfigurator(prisma);
  await seedBenison(prisma);
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
