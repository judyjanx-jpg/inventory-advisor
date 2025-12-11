/**
 * Standalone Queue Worker
 *
 * This is the CANONICAL worker entrypoint for production (Railway) and development.
 *
 * Production (Railway):
 *   Dockerfile.worker runs: npx tsx lib/queues/standalone-worker.ts
 *
 * Development:
 *   npx tsx lib/queues/standalone-worker.ts
 *   OR: npm run worker:dev
 */

import 'dotenv/config'
import http from 'http'
import dns from 'dns'
import { promisify } from 'util'

const dnsLookup = promisify(dns.lookup)

/**
 * Parse DATABASE_URL to extract host info (without exposing credentials)
 */
function parseDatabaseUrl(url: string): { host: string; port: string; hasSSL: boolean } {
  try {
    // Handle postgresql:// or postgres:// URLs
    const parsed = new URL(url)
    const sslParam = parsed.searchParams.get('sslmode') || parsed.searchParams.get('ssl')
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      hasSSL: !!sslParam || url.includes('sslmode=') || url.includes('ssl=')
    }
  } catch {
    return { host: 'unknown', port: '5432', hasSSL: false }
  }
}

/**
 * Check if a hostname can be resolved via DNS
 */
async function checkDnsResolution(hostname: string): Promise<{ resolved: boolean; ip?: string; error?: string }> {
  try {
    const result = await dnsLookup(hostname)
    return { resolved: true, ip: result.address }
  } catch (error: any) {
    return { resolved: false, error: error.code || error.message }
  }
}

/**
 * Check TCP connectivity to a host:port
 */
async function checkTcpConnectivity(host: string, port: number, timeoutMs: number = 5000): Promise<{ connected: boolean; error?: string }> {
  const net = await import('net')
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ connected: false, error: 'Connection timed out' })
    }, timeoutMs)

    socket.connect(port, host, () => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ connected: true })
    })

    socket.on('error', (err: any) => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ connected: false, error: err.code || err.message })
    })
  })
}

// Health check server for Railway
const PORT = process.env.PORT || 3001
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    status: 'ok',
    service: 'worker',
    timestamp: new Date().toISOString()
  }))
}).listen(PORT, () => {
  console.log(`   Healthcheck server listening on port ${PORT}`)
})

async function main() {
  console.log('\n╔════════════════════════════════════════════╗')
  console.log('║   Amazon Sync Worker (TypeScript)          ║')
  console.log('╚════════════════════════════════════════════╝\n')

  const redisUrl = process.env.REDIS_URL
  const dbUrl = process.env.DATABASE_URL

  console.log(`   REDIS_URL:    ${redisUrl ? '✓ configured' : '✗ not set'}`)
  console.log(`   DATABASE_URL: ${dbUrl ? '✓ configured' : '✗ not set'}`)

  if (!redisUrl) {
    console.error('\n❌ REDIS_URL not set in environment')
    process.exit(1)
  }

  if (!dbUrl) {
    console.error('\n❌ DATABASE_URL not set in environment')
    process.exit(1)
  }

  // Parse and display database connection info (without credentials)
  const dbInfo = parseDatabaseUrl(dbUrl)
  console.log(`\n   Database host: ${dbInfo.host}:${dbInfo.port}`)
  console.log(`   SSL configured: ${dbInfo.hasSSL ? '✓ yes' : '✗ no'}`)

  // Step 1: Check DNS resolution
  console.log('\n   Step 1: Checking DNS resolution...')
  const dnsResult = await checkDnsResolution(dbInfo.host)
  if (dnsResult.resolved) {
    console.log(`   ✓ DNS resolved: ${dbInfo.host} → ${dnsResult.ip}`)
  } else {
    console.log(`   ⚠️  DNS resolution failed: ${dnsResult.error}`)
    if (dbInfo.host.includes('.railway.internal')) {
      console.log('\n   💡 Hint: Internal Railway hostnames only work within the same project.')
      console.log('   If this worker is in a different Railway project, use the PUBLIC database URL instead.')
      console.log('   You can find it in Railway → Database → Variables → DATABASE_PUBLIC_URL')
    }
  }

  // Step 2: Check TCP connectivity (even if DNS failed, IP might be cached)
  console.log('\n   Step 2: Checking TCP connectivity...')
  const tcpResult = await checkTcpConnectivity(dbInfo.host, parseInt(dbInfo.port), 10000)
  if (tcpResult.connected) {
    console.log(`   ✓ TCP connection to ${dbInfo.host}:${dbInfo.port} successful`)
  } else {
    console.log(`   ⚠️  TCP connection failed: ${tcpResult.error}`)
    if (tcpResult.error === 'ECONNREFUSED') {
      console.log('   💡 Hint: Connection refused - database might not be running or port is blocked')
    } else if (tcpResult.error === 'ETIMEDOUT' || tcpResult.error === 'Connection timed out') {
      console.log('   💡 Hint: Connection timed out - check if services are in the same network')
    }
  }

  // Step 3: SSL guidance
  if (!dbInfo.hasSSL) {
    console.log('\n   ⚠️  No SSL mode detected in DATABASE_URL')
    console.log('   💡 Railway PostgreSQL may require SSL. Try adding ?sslmode=require to your DATABASE_URL')
    console.log('   Example: postgresql://user:pass@host:5432/db?sslmode=require')
  }

  // Step 4: Test database connection with retry logic
  console.log('\n   Step 3: Testing Prisma database connection...')
  const { prisma } = await import('@/lib/prisma')

  let dbConnected = false
  const maxRetries = 5
  const retryDelay = 5000 // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect()
      await prisma.$queryRaw`SELECT 1`
      dbConnected = true
      console.log('   ✓ Database connection successful')
      break
    } catch (error: any) {
      const errorMsg = error.message?.split('\n')[0] || error.message // First line only
      console.log(`   ⚠️  Database connection attempt ${attempt}/${maxRetries} failed: ${errorMsg}`)

      // Provide specific guidance based on error
      if (error.message?.includes('Connection reset by peer')) {
        console.log('   💡 Hint: "Connection reset by peer" often indicates SSL/TLS mismatch')
        console.log('   Try adding ?sslmode=require or ?sslmode=no-verify to DATABASE_URL')
      } else if (error.message?.includes("Can't reach database server")) {
        console.log('   💡 Hint: Cannot reach database - check network configuration')
      }

      if (attempt < maxRetries) {
        console.log(`   Retrying in ${retryDelay / 1000} seconds...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        // Try to reset connection before retry
        try {
          await prisma.$disconnect()
        } catch {
          // Ignore disconnect errors
        }
      } else {
        console.error('\n❌ Failed to connect to database after', maxRetries, 'attempts')
        console.error('\n   Troubleshooting checklist:')
        console.error('   1. ✓ DATABASE_URL format: postgresql://user:pass@host:port/database')
        console.error('   2. ✓ Database service is running in Railway')
        console.error('   3. ✓ Worker and database are in the SAME Railway project')
        console.error('   4. ✓ If using internal URL, both services must be linked')
        console.error('   5. ✓ Try using DATABASE_PUBLIC_URL if internal URL fails')
        console.error('   6. ✓ Add ?sslmode=require if SSL is required')
        process.exit(1)
      }
    }
  }

  console.log('\n   Initializing...\n')

  try {
    // Import and start scheduler
    const { initializeScheduler } = await import('./scheduler')
    await initializeScheduler()

    // Import and start worker
    const { startWorker } = await import('./worker')
    startWorker()

    console.log('\n✅ Standalone worker running!')
    console.log('   Press Ctrl+C to stop\n')

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n👋 Shutting down worker...')
      try {
        const { allQueues } = await import('./index')
        await Promise.all(allQueues.map(q => q.close()))
        const { prisma } = await import('@/lib/prisma')
        await prisma.$disconnect()
      } catch (e) {
        // Ignore shutdown errors
      }
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep process alive
    setInterval(() => {}, 1000 * 60 * 60)

  } catch (error: any) {
    console.error('❌ Failed to start worker:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
