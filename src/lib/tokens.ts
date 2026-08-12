import 'server-only';
import { randomBytes, createHash } from 'node:crypto';

// Single-use token crypto shared by the staff `password_reset_tokens` and the
// customer `customer_email_tokens` flows. The raw token is emailed to the user
// and NEVER stored; only its SHA-256 hash lives in the DB (schema comments),
// so a leaked table row can't be replayed as a valid link. Tokens are looked up
// by the unique `token_hash` index, so no app-side hash comparison is needed.

// A URL-safe secret (256 bits) plus its lookup hash. Hand `token` to the user
// (in the link), persist `tokenHash`.
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

// Deterministic hash used both when persisting and when looking a token up.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
