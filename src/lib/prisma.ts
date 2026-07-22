import { PrismaClient } from '@prisma/client';

// Singleton — dev hot-reload creates fresh module instances, so cache the
// client on globalThis to avoid exhausting DB connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
