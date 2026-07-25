import 'server-only';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import argon2 from 'argon2';
import { prisma } from './prisma';
import { writeAudit } from './audit';

// Auth.js credentials provider + JWT strategy — docs/DATABASE.md §4. No
// accounts/sessions tables (credentials doesn't support DB sessions and
// there's no OAuth requirement); if OAuth is ever wanted, the standard
// Prisma-adapter tables bolt on untouched.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/dashboard/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;
        const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
        if (!valid) return null;
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await writeAudit({ userId: user.id, entityType: 'user', entityId: user.id, action: 'login' });
        return { id: user.id, email: user.email, name: user.name, securityStamp: user.securityStamp };
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
