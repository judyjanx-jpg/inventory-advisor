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
    
    console.log(`✅ Stopped ${result} running sync(s) in sync_logs`);
    
    // Also reset api_connections sync status
    await prisma.$executeRaw`
      UPDATE api_connections 
      SET last_sync_status = 'idle'
      WHERE last_sync_status = 'running'
    `;
    
    console.log('✅ Reset API connection sync status');
    
    // Clear historical_sync_progress if exists
    try {
      await prisma.$executeRaw`DELETE FROM historical_sync_progress`;
      console.log('✅ Cleared historical_sync_progress');
    } catch (e) {
      console.log('(historical_sync_progress table not found - OK)');
    }
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

stopSync();

