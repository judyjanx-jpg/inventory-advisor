import { NextResponse } from 'next/server'
import { allQueues } from '@/lib/queues'

export async function POST() {
  const results = []
  
  for (const queue of allQueues) {
    const failed = await queue.clean(0, 'failed')
    const completed = await queue.clean(24 * 60 * 60 * 1000, 'completed') // Keep last 24h
    results.push({
      name: queue.name,
      failedCleaned: failed.length,
      completedCleaned: completed.length,
    })
  }
  
  return NextResponse.json({ success: true, results })
}