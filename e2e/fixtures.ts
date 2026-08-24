import 'dotenv/config';
import argon2 from 'argon2';
import { uuidv7 } from 'uuidv7';
import { PrismaClient } from '@prisma/client';

// Dedicated E2E staff accounts.
//
// The specs deliberately do NOT sign in as the real ADMIN_EMAIL account: its
// stored hash is whatever it was when the account was first created, the seed
// leaves an existing admin untouched on purpose, and a test suite has no
// business resetting a colleague's password. Three throwaway users also let the
// RBAC spec prove that `pricing.write` is genuinely separate from
// `catalog.write` — which is the whole reason cost basis is not reachable by
// the data-entry role.
//
// Created in globalSetup, removed in globalTeardown, along with everything they
// created.

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-Passw0rd!';

export const E2E_USERS = {
  admin: { email: 'e2e-admin@attractivehome.test', name: 'E2E Admin', role: 'admin' },
  dataEntry: {
    email: 'e2e-dataentry@attractivehome.test',
    name: 'E2E Data Entry',
    role: 'data-entry',
  },
  sales: { email: 'e2e-sales@attractivehome.test', name: 'E2E Sales', role: 'sales' },
} as const;

const prisma = new PrismaClient();

export async function createE2EUsers(): Promise<void> {
  const passwordHash = await argon2.hash(E2E_PASSWORD, { type: argon2.argon2id });

  for (const spec of Object.values(E2E_USERS)) {
    const role = await prisma.role.findUnique({ where: { slug: spec.role } });
    if (!role)
      throw new Error(
        `Seed role "${spec.role}" is missing — run \`npx tsx prisma/seed/index.ts\`.`,
      );

    const user = await prisma.user.upsert({
      where: { email: spec.email },
      // Rewrite the hash every run so a changed E2E_PASSWORD takes effect.
      update: { passwordHash, isActive: true, securityStamp: uuidv7() },
      create: {
        id: uuidv7(),
        email: spec.email,
        passwordHash,
        name: spec.name,
        securityStamp: uuidv7(),
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
}

export async function destroyE2EUsers(): Promise<void> {
  const emails = Object.values(E2E_USERS).map((u) => u.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  // Quotes are SetNull on creator, so they would survive as orphans. The specs
  // title everything "E2E ", which is what makes them findable.
  await prisma.quote.deleteMany({
    where: { OR: [{ createdBy: { in: ids } }, { title: { startsWith: 'E2E ' } }] },
  });
  await prisma.lead.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
