// lib/prisma.ts
import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

// Create Prisma client with optimized settings for Railway
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  })
}

// Prisma client singleton - MUST cache in ALL environments to avoid connection exhaustion
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Always cache the instance to prevent multiple connections
globalForPrisma.prisma = prisma

/**
 * Execute a Prisma operation with retry logic for transient connection failures.
 * This handles Railway's internal DNS resolution issues and cold start problems.
 *
 * @param operation - Async function that performs the Prisma operation
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay between retries in ms (default: 1000)
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error

      // Check if this is a retryable connection error
      const isConnectionError =
        error?.message?.includes("Can't reach database server") ||
        error?.message?.includes('Connection refused') ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.message?.includes('connection pool') ||
        error?.code === 'P1001' || // Prisma: Can't reach database server
        error?.code === 'P1002' || // Prisma: Database server timed out
        error?.code === 'P1008' || // Prisma: Operations timed out
        error?.code === 'P1017'    // Prisma: Server closed connection

      if (!isConnectionError || attempt === maxRetries) {
        throw error
      }

      // Exponential backoff: 1s, 2s, 4s...
      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      console.warn(
        `[Prisma] Connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`,
        error?.message
      )

      // Try to reconnect before retry
      try {
        await prisma.$disconnect()
        await prisma.$connect()
      } catch {
        // Ignore reconnection errors, the retry will handle it
      }

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
