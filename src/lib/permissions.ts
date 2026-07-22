import { cache } from 'react';
import { auth } from './auth';
import { prisma } from './prisma';

// Effective permission = deny override > allow override > union of role
// permissions — the one documented helper used by every server action
// (docs/DATABASE.md §4). Three tiny indexed queries, per-request cached.
export const effectivePermissions = cache(async (userId: string): Promise<Set<string>> => {
  const [rolePerms, overrides] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role: { userRoles: { some: { userId } } } },
      select: { permission: { select: { slug: true } } },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { effect: true, permission: { select: { slug: true } } },
    }),
  ]);
  const effective = new Set(rolePerms.map((rp) => rp.permission.slug));
  for (const o of overrides) if (o.effect === 'allow') effective.add(o.permission.slug);
  for (const o of overrides) if (o.effect === 'deny') effective.delete(o.permission.slug);
  return effective;
});

export class AccessDeniedError extends Error {
  constructor(permission: string) {
    super(`Access denied: ${permission}`);
  }
}

// Session → live user row, enforcing is_active and the security_stamp match
// (rotating the stamp on password change/deactivation kills existing JWTs).
export const requireUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.securityStamp !== session.user.securityStamp) return null;
  return user;
});

export async function requirePermission(slug: string) {
  const user = await requireUser();
  if (!user) throw new AccessDeniedError('unauthenticated');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has(slug)) throw new AccessDeniedError(slug);
  return user;
}
