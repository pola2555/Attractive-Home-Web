import 'server-only';
import { cache } from 'react';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import argon2 from 'argon2';
import { prisma } from './prisma';

// Customer authentication — a SECOND, fully isolated Auth.js v5 instance,
// separate from the staff `auth.ts`. Isolation is by distinct cookie names +
// basePath so the two never share a session; the same AUTH_SECRET is fine.
// Mirrors the staff securityStamp revocation pattern. Reads the `customers`
// table only — never staff `users`/RBAC (docs/DATABASE.md §4, Phase 5 plan).
const isProd = process.env.NODE_ENV === 'production';

export const {
  handlers: customerHandlers,
  auth: customerAuth,
  signIn: customerSignIn,
  signOut: customerSignOut,
} = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  basePath: '/api/customer-auth',
  // Distinct cookie names keep the customer session from colliding with staff.
  cookies: {
    sessionToken: { name: 'ah_customer.session', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: isProd } },
    callbackUrl: { name: 'ah_customer.callback-url', options: { sameSite: 'lax', path: '/', secure: isProd } },
    csrfToken: { name: 'ah_customer.csrf', options: { httpOnly: true, sameSite: 'lax', path: '/', secure: isProd } },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;
        const customer = await prisma.customer.findUnique({ where: { email } });
        if (!customer || !customer.isActive || !customer.passwordHash) return null;
        const valid = await argon2.verify(customer.passwordHash, password).catch(() => false);
        if (!valid) return null;
        await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
        return { id: customer.id, email: customer.email, name: customer.name, securityStamp: customer.securityStamp };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.securityStamp = user.securityStamp;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.securityStamp = token.securityStamp;
      }
      return session;
    },
  },
});

// Session → live customer row, enforcing is_active + securityStamp match
// (rotating the stamp on password change/deactivation kills existing JWTs).
export const requireCustomer = cache(async () => {
  const session = await customerAuth();
  const id = session?.user?.id;
  if (!id) return null;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || !customer.isActive || customer.securityStamp !== session.user.securityStamp) return null;
  return customer;
});
