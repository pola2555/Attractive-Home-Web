'use server';

import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { customerSignIn, customerSignOut } from '@/lib/customer-auth';

export type AuthState = { error?: string };

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

  try {
    await prisma.customer.create({
      data: {
        id: uuidv7(),
        email,
        name: name || null,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        securityStamp: uuidv7(),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'An account with that email already exists.' };
    }
    throw err;
  }

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

export async function signInCustomer(
  locale: string,
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, 'email').toLowerCase();
  const password = field(formData, 'password');
  if (!email || !password) return { error: 'Enter your email and password.' };

  try {
    await customerSignIn('credentials', { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Invalid email or password.' };
    throw err;
  }
  redirect(`/${locale}/account`);
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOutCustomer(locale: string): Promise<void> {
  await customerSignOut({ redirect: false });
  redirect(`/${locale}`);
}
