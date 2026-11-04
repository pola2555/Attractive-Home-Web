'use server';

import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signIn as staffSignIn } from '@/lib/auth';
import { customerSignIn, customerSignOut, requireCustomer } from '@/lib/customer-auth';
import {
  createCustomerEmailToken,
  consumeCustomerEmailToken,
  CUSTOMER_VERIFY_TTL_HOURS,
  CUSTOMER_RESET_TTL_HOURS,
} from '@/lib/authTokens';
import { sendCustomerVerificationEmail, sendCustomerPasswordResetEmail } from '@/lib/email';
import { rateLimit, rateLimitPeek, rateLimitRecord, clientIp, tooManyMessage } from '@/lib/rate-limit';

export type AuthState = { error?: string };
export type RequestState = { done: boolean; error?: string };

// Fire-and-forget the verification email for a freshly created / unverified
// customer. Never throws into the calling flow.
async function dispatchVerification(
  customer: { id: string; email: string; name: string | null },
  locale: string,
): Promise<void> {
  try {
    const token = await createCustomerEmailToken(customer.id, 'verify_email');
    await sendCustomerVerificationEmail({
      to: customer.email,
      name: customer.name,
      token,
      locale,
      expiresInHours: CUSTOMER_VERIFY_TTL_HOURS,
    });
  } catch (err) {
    console.error('[account] verification email failed:', err);
  }
}

const emailSchema = z.string().email();
const MIN_PASSWORD = 8;

function field(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

export async function signUpCustomer(
  locale: string,
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, 'email').toLowerCase();
  const name = field(formData, 'name');
  const password = field(formData, 'password');
  if (!emailSchema.safeParse(email).success) return { error: 'Enter a valid email address.' };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };

  const signupIp = await clientIp();
  const signupRl = rateLimit([
    { key: `signup:email:${email}`, limit: 4, windowMs: 60 * 60_000 },
    ...(signupIp ? [{ key: `signup:ip:${signupIp}`, limit: 6, windowMs: 60 * 60_000 }] : []),
  ]);
  if (!signupRl.ok) return { error: tooManyMessage(signupRl.retryAfterMs) };

  let created: { id: string; email: string; name: string | null };
  try {
    created = await prisma.customer.create({
      data: {
        id: uuidv7(),
        email,
        name: name || null,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        securityStamp: uuidv7(),
      },
      select: { id: true, email: true, name: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'An account with that email already exists.' };
    }
    throw err;
  }

  // Send the email-confirmation link, but don't gate sign-in on it — the account
  // is usable immediately; the account page nudges them to confirm.
  await dispatchVerification(created, locale);

  try {
    await customerSignIn('credentials', { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Account created — please sign in.' };
    throw err;
  }
  redirect(`/${locale}/account`);
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

// Single sign-in entry point for the whole site. If the credentials belong to a
// staff account, the STAFF (dashboard) session is established and we return them
// to the public site — the navbar then reveals a "Dashboard" link — rather than
// forcing them into the dashboard. Otherwise it's a normal customer sign-in. The
// two Auth.js instances stay isolated (distinct cookies) — this just unifies the
// form.
export async function signInCustomer(
  locale: string,
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, 'email').toLowerCase();
  const password = field(formData, 'password');
  if (!email || !password) return { error: 'Enter your email and password.' };

  // Brute-force throttle: count FAILED sign-ins, not successful ones. A correct
  // login flows unlimited; wrong-password attempts accumulate and lock out. We
  // peek to gate the attempt, then record a hit only on the failure path below —
  // so a legitimate user signing in repeatedly is never throttled, while a
  // password-guesser is. (Enumeration is handled elsewhere: the error is generic
  // and sign-up/reset throttle every attempt.)
  const signinIp = await clientIp();
  const signinScopes = [
    { key: `signin:email:${email}`, limit: 8, windowMs: 15 * 60_000 },
    ...(signinIp ? [{ key: `signin:ip:${signinIp}`, limit: 40, windowMs: 15 * 60_000 }] : []),
  ];
  const gate = rateLimitPeek(signinScopes);
  if (!gate.ok) return { error: tooManyMessage(gate.retryAfterMs) };

  // Staff first: their credentials establish the dashboard session, but we leave
  // them on the public home page — the navbar's Dashboard link takes it from here.
  if (await trySignInStaff(email, password)) redirect(`/${locale}`);

  try {
    await customerSignIn('credentials', { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      rateLimitRecord(signinScopes); // this attempt failed — count it
      return { error: 'Invalid email or password.' };
    }
    throw err;
  }
  redirect(`/${locale}/account`);
}

// Establishes the staff session if the credentials match an active staff user.
// Returns false (without touching any session) when they don't — so the caller
// falls through to the customer flow.
async function trySignInStaff(email: string, password: string): Promise<boolean> {
  try {
    await staffSignIn('credentials', { email, password, redirect: false });
    return true;
  } catch (err) {
    if (err instanceof AuthError) return false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOutCustomer(locale: string): Promise<void> {
  await customerSignOut({ redirect: false });
  redirect(`/${locale}`);
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

// Consume a verify_email token (from the emailed link) and mark the address
// confirmed. Invoked from the /account/verify confirmation button.
export async function verifyCustomerEmail(locale: string, formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const customerId = await consumeCustomerEmailToken(token, 'verify_email');
  if (!customerId) redirect(`/${locale}/account/verify?status=invalid`);
  await prisma.customer.updateMany({
    where: { id: customerId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  redirect(`/${locale}/account/verify?status=ok`);
}

// Re-send the verification email to the signed-in customer.
export async function resendCustomerVerification(locale: string): Promise<void> {
  const customer = await requireCustomer();
  if (!customer) redirect(`/${locale}/account/sign-in`);
  if (customer.emailVerifiedAt) redirect(`/${locale}/account`);
  // Cap resend-bombing per account; look identical to the caller either way.
  const resendRl = rateLimit([{ key: `verify-resend:cust:${customer.id}`, limit: 4, windowMs: 60 * 60_000 }]);
  if (!resendRl.ok) redirect(`/${locale}/account?verify_sent=1`);
  await dispatchVerification({ id: customer.id, email: customer.email, name: customer.name }, locale);
  redirect(`/${locale}/account?verify_sent=1`);
}

// ---------------------------------------------------------------------------
// Password reset (forgot / set new)
// ---------------------------------------------------------------------------

export async function requestCustomerPasswordReset(
  locale: string,
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const email = field(formData, 'email').toLowerCase();
  if (!emailSchema.safeParse(email).success) return { done: false, error: 'Enter a valid email address.' };

  // Throttle reset-email bombing. When over the limit, return the same generic
  // "done" as a success and skip the send — no enumeration, no bombing.
  const resetIp = await clientIp();
  const resetRl = rateLimit([
    { key: `reset-req:email:${email}`, limit: 3, windowMs: 60 * 60_000 },
    ...(resetIp ? [{ key: `reset-req:ip:${resetIp}`, limit: 10, windowMs: 60 * 60_000 }] : []),
  ]);
  if (!resetRl.ok) return { done: true };

  // Generic response regardless of whether the account exists (no enumeration).
  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isActive: true, passwordHash: true },
  });
  if (customer && customer.isActive && customer.passwordHash) {
    const token = await createCustomerEmailToken(customer.id, 'reset_password');
    await sendCustomerPasswordResetEmail({
      to: customer.email,
      name: customer.name,
      token,
      locale,
      expiresInHours: CUSTOMER_RESET_TTL_HOURS,
    });
  }
  return { done: true };
}

export async function resetCustomerPassword(
  locale: string,
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = field(formData, 'token');
  const password = field(formData, 'password');
  const confirm = field(formData, 'confirm');
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: 'Passwords do not match.' };

  // Tokens are cryptographically random, but still cap per-IP token guessing.
  const resetIp = await clientIp();
  if (resetIp) {
    const rl = rateLimit([{ key: `reset-confirm:ip:${resetIp}`, limit: 15, windowMs: 15 * 60_000 }]);
    if (!rl.ok) return { error: tooManyMessage(rl.retryAfterMs) };
  }

  const customerId = await consumeCustomerEmailToken(token, 'reset_password');
  if (!customerId) return { error: 'This reset link is invalid or has expired. Request a new one.' };

  // A successful reset also proves control of the inbox → mark verified, and
  // rotate the security stamp to kill any existing sessions.
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      securityStamp: uuidv7(),
      emailVerifiedAt: new Date(),
    },
  });
  redirect(`/${locale}/account/sign-in?reset=1`);
}
