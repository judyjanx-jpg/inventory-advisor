/**
 * DEPRECATED - This file is no longer used.
 *
 * The canonical worker entrypoint is now:
 *   lib/queues/standalone-worker.ts
 *
 * Run with:
 *   npx tsx lib/queues/standalone-worker.ts
 *
 * Or via Docker:
 *   Dockerfile.worker now uses the TypeScript worker
 *
 * This stub exists to prevent accidental use and provide guidance.
 */

console.error('╔══════════════════════════════════════════════════════════════╗')
console.error('║  ⚠️  DEPRECATED: worker.js is no longer used                  ║')
console.error('╠══════════════════════════════════════════════════════════════╣')
console.error('║  The canonical worker is now:                                ║')
console.error('║    lib/queues/standalone-worker.ts                           ║')
console.error('║                                                              ║')
console.error('║  Run with:                                                   ║')
console.error('║    npx tsx lib/queues/standalone-worker.ts                   ║')
console.error('║                                                              ║')
console.error('║  Dockerfile.worker has been updated to use the TS worker.   ║')
console.error('╚══════════════════════════════════════════════════════════════╝')

process.exit(1)
