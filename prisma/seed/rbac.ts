import argon2 from 'argon2';
import { uuidv7 } from 'uuidv7';
import type { PrismaClient } from '@prisma/client';

// docs/DATABASE.md §4 — the seed permissions.
const PERMISSIONS = [
  { slug: 'catalog.read', module: 'catalog', description: 'View catalog data in the dashboard' },
  {
    slug: 'catalog.write',
    module: 'catalog',
    description: 'Create, edit and delete products and facet vocabularies',
  },
  {
    slug: 'portfolio.write',
    module: 'portfolio',
    description: 'Create, edit and delete portfolio projects',
  },
  {
    slug: 'content.write',
    module: 'content',
    description: 'Edit services, content blocks and sample rooms',
  },
  { slug: 'leads.read', module: 'leads', description: 'View leads' },
  { slug: 'leads.write', module: 'leads', description: 'Update, assign and annotate leads' },
  { slug: 'settings.write', module: 'settings', description: 'Edit site settings' },
  {
    slug: 'users.manage',
    module: 'users',
    description: 'Manage users, roles and permission overrides',
  },
  { slug: 'audit.read', module: 'audit', description: 'View the audit log' },
  // Quoting + pricing. Deliberately NOT folded into catalog.write: the seeded
  // data-entry role holds catalog.write, and cost basis, supplier prices and
  // margins are exactly what that role must not see. Customers never see
  // prices at all, so the internal boundary has to be real.
  { slug: 'quotes.read', module: 'quotes', description: 'View quotes and their landed cost' },
  {
    slug: 'quotes.write',
    module: 'quotes',
    description: 'Create and edit quotes, assemble items and cost shipments',
  },
  {
    slug: 'pricing.write',
    module: 'pricing',
    description:
      'Edit product configurators, pricing rules and freight/customs rate cards (reveals cost basis and margins)',
  },
] as const;

// docs/DATABASE.md §4 — admin = all; data-entry = catalog.read/write,
// portfolio.write, content.write. `sales` quotes without seeing the
// configurator's rules or the rate cards (pricing.write is admin-only).
const ROLES: {
  slug: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: readonly string[];
}[] = [
  {
    slug: 'admin',
    name: 'Administrator',
    description: 'Full access to every module',
    isSystem: true,
    permissions: PERMISSIONS.map((p) => p.slug),
  },
  {
    slug: 'data-entry',
    name: 'Data Entry',
    description: 'Catalog, portfolio and content editing',
    isSystem: true,
    permissions: ['catalog.read', 'catalog.write', 'portfolio.write', 'content.write'],
  },
  {
    slug: 'sales',
    name: 'Sales',
    description: 'Leads and quoting — can price a request, cannot edit pricing rules',
    isSystem: true,
    permissions: ['catalog.read', 'leads.read', 'leads.write', 'quotes.read', 'quotes.write'],
  },
];

export async function seedRbac(prisma: PrismaClient): Promise<void> {
  const permissionIdBySlug = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { slug: permission.slug },
      update: {},
      create: { id: uuidv7(), ...permission },
    });
    permissionIdBySlug.set(row.slug, row.id);
  }

  for (const role of ROLES) {
    const { permissions, ...data } = role;
    const row = await prisma.role.upsert({
      where: { slug: role.slug },
      update: {},
      create: { id: uuidv7(), ...data },
    });
    for (const slug of permissions) {
      const permissionId = permissionIdBySlug.get(slug);
      if (!permissionId) throw new Error(`Unknown permission slug in role seed: ${slug}`);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: row.id, permissionId } },
        update: {},
        create: { roleId: row.id, permissionId },
      });
    }
  }
  console.log(`  rbac: ${PERMISSIONS.length} permissions, ${ROLES.length} roles ensured`);
}

// First admin user from env (ADMIN_EMAIL / ADMIN_PASSWORD). The real admin
// email is an OPEN DECISION (README) — placeholders are expected until then.
export async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('  admin user: ADMIN_EMAIL / ADMIN_PASSWORD not set — skipped');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log(`  admin user: ${email} already exists — left untouched`);
  } else {
    userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        name: 'Administrator',
        securityStamp: uuidv7(),
      },
    });
    console.log(`  admin user: created ${email}`);
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'admin' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: adminRole.id } },
    update: {},
    create: { userId, roleId: adminRole.id },
  });
}
