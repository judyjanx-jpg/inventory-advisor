require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function stopSync() {
  try {
    // Update all running syncs to cancelled
    const result = await prisma.$executeRaw`
      UPDATE sync_logs 
      SET status = 'cancelled', 
          completed_at = NOW()
      WHERE status = 'running'
    `;
    
    console.log(`✅ Stopped ${result} running sync(s)`);
    
    // Also reset api_connections sync status
    await prisma.$executeRaw`
      UPDATE api_connections 
      SET last_sync_status = 'idle'
      WHERE last_sync_status = 'running'
    `;
    
    console.log('✅ Reset API connection sync status');
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

stopSync();

