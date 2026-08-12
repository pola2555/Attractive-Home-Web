'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { createStaffPasswordResetToken, STAFF_RESET_TTL_HOURS } from '@/lib/authTokens';
import { sendStaffPasswordResetEmail } from '@/lib/email';

export type FormState = { error?: string };

const emailSchema = z.string().email();
const MIN_PASSWORD = 8;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function hash(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

// Ids of roles/permissions that actually exist, to reject tampered form values.
async function validIdSets() {
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ select: { id: true, slug: true } }),
    prisma.permission.findMany({ select: { id: true } }),
  ]);
  return {
    roleIds: new Set(roles.map((r) => r.id)),
    permissionIds: new Set(permissions.map((p) => p.id)),
    adminRoleId: roles.find((r) => r.slug === 'admin')?.id ?? null,
  };
}

function readRoleIds(fd: FormData, valid: Set<string>): string[] {
  return fd
    .getAll('roleIds')
    .filter((v): v is string => typeof v === 'string' && valid.has(v));
}

function readOverrides(
  fd: FormData,
  permissionIds: Set<string>,
): { permissionId: string; effect: 'allow' | 'deny' }[] {
  const out: { permissionId: string; effect: 'allow' | 'deny' }[] = [];
  for (const permissionId of permissionIds) {
    const v = str(fd, `override_${permissionId}`);
    if (v === 'allow' || v === 'deny') out.push({ permissionId, effect: v });
  }
  return out;
}

class NoAdminError extends Error {}

// Guard run inside the update transaction: never leave the system with zero
// active administrators.
async function assertActiveAdminRemains(tx: Prisma.TransactionClient, adminRoleId: string | null) {
  if (!adminRoleId) return;
  const count = await tx.user.count({
    where: { isActive: true, userRoles: { some: { roleId: adminRoleId } } },
  });
  if (count === 0) throw new NoAdminError();
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('users.manage');

  const email = str(formData, 'email').toLowerCase();
  const name = str(formData, 'name');
  const password = str(formData, 'password');
  if (!emailSchema.safeParse(email).success) return { error: 'Enter a valid email address.' };
  if (!name) return { error: 'A name is required.' };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };

  const valid = await validIdSets();
  const roleIds = readRoleIds(formData, valid.roleIds);

  const id = uuidv7();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id,
          email,
          name,
          passwordHash: await hash(password),
          securityStamp: uuidv7(),
          isActive: formData.get('isActive') === 'on',
        },
      });
      if (roleIds.length) {
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'That email is already in use.' };
    }
    throw err;
  }

  await writeAudit({
    userId: actor.id,
    entityType: 'user',
    entityId: id,
    action: 'create',
    diff: { email: { from: null, to: email } },
  });
  revalidatePath('/dashboard/users');
  redirect(`/dashboard/users/${id}/edit`);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateUser(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission('users.manage');
  const isSelf = actor.id === userId;

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, isActive: true },
  });
  if (!existing) return { error: 'User not found.' };

  const email = str(formData, 'email').toLowerCase();
  const name = str(formData, 'name');
  const password = str(formData, 'password'); // blank = keep current
  if (!emailSchema.safeParse(email).success) return { error: 'Enter a valid email address.' };
  if (!name) return { error: 'A name is required.' };
  if (password && password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  const valid = await validIdSets();
  // Self-guard: you can change your own email/name/password, but never your own
  // active flag, roles or overrides — that's how an admin could lock themselves out.
  const isActive = isSelf ? true : formData.get('isActive') === 'on';
  const roleIds = isSelf ? null : readRoleIds(formData, valid.roleIds);
  const overrides = isSelf ? null : readOverrides(formData, valid.permissionIds);

  // Rotate the security stamp (kills outstanding JWTs) on password change or on
  // deactivation — docs/DATABASE.md §4.
  const passwordChanged = Boolean(password);
  const deactivating = !isSelf && existing.isActive && !isActive;
  const rotate = passwordChanged || deactivating;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          email,
          name,
          isActive,
          ...(passwordChanged ? { passwordHash: await hash(password) } : {}),
          ...(rotate ? { securityStamp: uuidv7() } : {}),
        },
      });
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId } });
        if (roleIds.length) {
          await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
        }
      }
      if (overrides) {
        await tx.userPermissionOverride.deleteMany({ where: { userId } });
        if (overrides.length) {
          await tx.userPermissionOverride.createMany({
            data: overrides.map((o) => ({ userId, permissionId: o.permissionId, effect: o.effect })),
          });
        }
      }
      await assertActiveAdminRemains(tx, valid.adminRoleId);
    });
  } catch (err) {
    if (err instanceof NoAdminError) {
      return { error: 'There must be at least one active administrator.' };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'That email is already in use.' };
    }
    throw err;
  }

  await writeAudit({
    userId: actor.id,
    entityType: 'user',
    entityId: userId,
    action: 'update',
    diff: {
      is_active: { from: existing.isActive, to: isActive },
      password: { from: null, to: passwordChanged ? 'changed' : null },
    },
  });
  revalidatePath('/dashboard/users');
  redirect('/dashboard/users');
}

// ---------------------------------------------------------------------------
// Send a password-reset link to a staff member (admin-initiated; the
// alternative to typing a new password for them). Reuses the same single-use
// token + email as the self-service flow. Invoked as a bound <form action>.
// ---------------------------------------------------------------------------

export async function sendUserPasswordReset(userId: string): Promise<void> {
  const actor = await requirePermission('users.manage');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) redirect(`/dashboard/users/${userId}/edit?reset_error=1`);

  const token = await createStaffPasswordResetToken(user.id);
  const result = await sendStaffPasswordResetEmail({
    to: user.email,
    name: user.name,
    token,
    expiresInHours: STAFF_RESET_TTL_HOURS,
  });
  await writeAudit({
    userId: actor.id,
    entityType: 'user',
    entityId: userId,
    action: 'update',
    diff: { password_reset: { from: null, to: result.skipped ? 'skipped (email off)' : 'sent' } },
  });
  redirect(`/dashboard/users/${userId}/edit?${result.skipped ? 'reset_skipped=1' : 'reset_sent=1'}`);
}
