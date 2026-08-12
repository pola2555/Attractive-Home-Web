'use server';

import { redirect } from 'next/navigation';
import { uuidv7 } from 'uuidv7';
import argon2 from 'argon2';
import { prisma } from '@/lib/prisma';
import { consumeStaffPasswordResetToken } from '@/lib/authTokens';
import { writeAudit } from '@/lib/audit';

export type ResetState = { error?: string };

const MIN_PASSWORD = 8;

// Confirm a staff password reset. Consumes the single-use token, sets the new
// hash and rotates the security stamp (invalidating any outstanding sessions),
// then sends the user to the login page.
export async function resetStaffPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: 'Passwords do not match.' };

  const userId = await consumeStaffPasswordResetToken(token);
  if (!userId) return { error: 'This reset link is invalid or has expired. Request a new one.' };

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      securityStamp: uuidv7(),
    },
  });
  await writeAudit({
    userId,
    entityType: 'user',
    entityId: userId,
    action: 'update',
    diff: { password: { from: null, to: 'reset' } },
  });
  redirect('/dashboard/login?reset=1');
}
