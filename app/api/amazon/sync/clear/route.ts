// app/api/amazon/sync/clear/route.ts (temporary - delete after use)
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // Import dynamically to avoid errors if queues don't exist
    let cleared = []
    
    try {
      const { historicalSyncQueue } = await import('@/lib/queues/historical-sync')
      await historicalSyncQueue.obliterate({ force: true })
      cleared.push('historicalSyncQueue')
    } catch (e) {
      console.log('historicalSyncQueue not available')
    }
    
    try {
      const { ordersQueue, financesQueue, inventoryQueue } = await import('@/lib/queues')
      await ordersQueue.obliterate({ force: true })
      await financesQueue.obliterate({ force: true })
      await inventoryQueue.obliterate({ force: true })
      cleared.push('ordersQueue', 'financesQueue', 'inventoryQueue')
    } catch (e) {
      console.log('Regular queues not available')
    }
    
    return NextResponse.json({ success: true, message: 'All queues cleared', cleared })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


