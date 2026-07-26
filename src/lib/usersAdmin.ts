import 'server-only';
import { prisma } from './prisma';

// Admin-side staff user + RBAC helpers (docs/DATABASE.md §4). Effective access
// is resolved live per request by effectivePermissions(), so role/override
// edits take effect on the target's next request — no stamp rotation needed for
// those (only password change + deactivation rotate the stamp).

export type UserRow = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  roles: string[];
};

export async function listUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      lastLoginAt: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    roles: u.userRoles.map((r) => r.role.name),
  }));
}

export type RoleOption = { id: string; slug: string; name: string; description: string | null };
export type PermissionOption = { id: string; slug: string; module: string; description: string | null };

export async function listRoles(): Promise<RoleOption[]> {
  return prisma.role.findMany({
    orderBy: { slug: 'asc' },
    select: { id: true, slug: true, name: true, description: true },
  });
}

export async function listPermissions(): Promise<PermissionOption[]> {
  return prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { slug: 'asc' }],
    select: { id: true, slug: true, module: true, description: true },
  });
}

export type UserFormInitial = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roleIds: string[];
  overrides: Record<string, 'allow' | 'deny'>; // permissionId → effect
};

export async function getUserForEdit(id: string): Promise<UserFormInitial | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      userRoles: { select: { roleId: true } },
      permissionOverrides: { select: { permissionId: true, effect: true } },
    },
  });
  if (!u) return null;

  const overrides: Record<string, 'allow' | 'deny'> = {};
  for (const o of u.permissionOverrides) overrides[o.permissionId] = o.effect;

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isActive: u.isActive,
    roleIds: u.userRoles.map((r) => r.roleId),
    overrides,
  };
}
