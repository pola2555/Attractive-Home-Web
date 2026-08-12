import 'server-only';
import { uuidv7 } from 'uuidv7';
import { prisma } from './prisma';
import { generateToken, hashToken } from './tokens';

// Persistence for the single-use email tokens: staff `password_reset_tokens`
// and customer `customer_email_tokens`. Only the SHA-256 hash is stored. Consume
// is atomic — a conditional `updateMany … where usedAt: null` guards against a
// token being spent twice (double-submit / concurrent clicks).

export const STAFF_RESET_TTL_HOURS = 1;
export const CUSTOMER_VERIFY_TTL_HOURS = 24;
export const CUSTOMER_RESET_TTL_HOURS = 1;

export type CustomerTokenPurpose = 'verify_email' | 'reset_password';

function expiryFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Staff password reset
// ---------------------------------------------------------------------------

export async function createStaffPasswordResetToken(userId: string): Promise<string> {
  const { token, tokenHash } = generateToken();
  await prisma.$transaction([
    // Only one outstanding link per user.
    prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { id: uuidv7(), userId, tokenHash, expiresAt: expiryFromNow(STAFF_RESET_TTL_HOURS) },
    }),
  ]);
  return token;
}

// Returns the userId if the token is valid + unused + unexpired, and marks it
// used in the same call. Null otherwise.
export async function consumeStaffPasswordResetToken(rawToken: string): Promise<string | null> {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  const res = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (res.count === 0) return null; // raced — already consumed
  return row.userId;
}

// ---------------------------------------------------------------------------
// Customer email tokens (verify_email | reset_password)
// ---------------------------------------------------------------------------

export async function createCustomerEmailToken(
  customerId: string,
  purpose: CustomerTokenPurpose,
): Promise<string> {
  const ttl = purpose === 'verify_email' ? CUSTOMER_VERIFY_TTL_HOURS : CUSTOMER_RESET_TTL_HOURS;
  const { token, tokenHash } = generateToken();
  await prisma.$transaction([
    prisma.customerEmailToken.deleteMany({ where: { customerId, purpose, usedAt: null } }),
    prisma.customerEmailToken.create({
      data: { id: uuidv7(), customerId, purpose, tokenHash, expiresAt: expiryFromNow(ttl) },
    }),
  ]);
  return token;
}

export async function consumeCustomerEmailToken(
  rawToken: string,
  purpose: CustomerTokenPurpose,
): Promise<string | null> {
  const row = await prisma.customerEmailToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  const res = await prisma.customerEmailToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (res.count === 0) return null;
  return row.customerId;
}
