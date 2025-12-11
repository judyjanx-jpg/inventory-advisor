#!/usr/bin/env node
/**
 * Smart start script for Railway
 *
 * Checks WORKER_MODE env var to determine which service to run:
 * - WORKER_MODE=true → runs the TypeScript worker
 * - Otherwise → runs Next.js production server
 */

const { spawn } = require('child_process');

const isWorker = process.env.WORKER_MODE === 'true';

if (isWorker) {
  console.log('🔧 Starting worker service...');
  const worker = spawn('npx', ['tsx', 'lib/queues/standalone-worker.ts'], {
    stdio: 'inherit',
    shell: true
  });
  worker.on('exit', (code) => process.exit(code || 0));
} else {
  console.log('🌐 Starting Next.js web server...');
  const next = spawn('npx', ['next', 'start'], {
    stdio: 'inherit',
    shell: true
  });
  next.on('exit', (code) => process.exit(code || 0));
}
