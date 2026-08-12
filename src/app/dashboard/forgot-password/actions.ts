'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createStaffPasswordResetToken, STAFF_RESET_TTL_HOURS } from '@/lib/authTokens';
import { sendStaffPasswordResetEmail } from '@/lib/email';

export type ForgotState = { done: boolean; error?: string };

const emailSchema = z.string().email();

// Request a staff password-reset link. Always reports the same generic success
// (no account enumeration) and never throws if email is unconfigured — the
// token is still created, the send just no-ops.
export async function requestStaffReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!emailSchema.safeParse(email).success) return { done: false, error: 'Enter a valid email address.' };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isActive: true },
  });
  if (user && user.isActive) {
    const token = await createStaffPasswordResetToken(user.id);
    await sendStaffPasswordResetEmail({
      to: user.email,
      name: user.name,
      token,
      expiresInHours: STAFF_RESET_TTL_HOURS,
    });
  }
  return { done: true };
}
