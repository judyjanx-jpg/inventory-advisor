// lib/prisma.ts
// NOTE: Prisma client initialization is currently failing due to binary download issues
// The profit routes have been switched to use direct pg connections via lib/db.ts
// This file is kept for compatibility but exports a null client
// Once Prisma binaries can be downloaded again, run `npx prisma generate` and restore

export const prisma = null as any

// Original Prisma setup (disabled while binaries unavailable):
// import { PrismaClient } from '@prisma/client'
// const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
// export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ['error', 'warn'] })
// if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
