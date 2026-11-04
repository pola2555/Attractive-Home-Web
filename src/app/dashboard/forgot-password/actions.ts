'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createStaffPasswordResetToken, STAFF_RESET_TTL_HOURS } from '@/lib/authTokens';
import { sendStaffPasswordResetEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

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

  // Throttle reset-email bombing (mirrors requestCustomerPasswordReset). Over
  // the limit returns the same generic "done" and skips the send — no bomb, no
  // enumeration. IP scope is best-effort until the Phase 5 proxy sets XFF.
  const ip = await clientIp();
  const rl = rateLimit([
    { key: `staff-reset-req:email:${email}`, limit: 3, windowMs: 60 * 60_000 },
    ...(ip ? [{ key: `staff-reset-req:ip:${ip}`, limit: 10, windowMs: 60 * 60_000 }] : []),
  ]);
  if (!rl.ok) return { done: true };

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
