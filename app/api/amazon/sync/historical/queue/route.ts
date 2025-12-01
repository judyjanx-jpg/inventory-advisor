import { NextRequest, NextResponse } from 'next/server'
import { queueHistoricalSync, getHistoricalSyncQueueStatus, historicalSyncQueue } from '@/lib/queues/historical-sync'

/**
 * Historical Sync Queue API
 * 
 * POST - Start a new historical sync job
 * GET - Get queue status and recent jobs
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const daysBack = body.daysBack || 730
    const forceRefresh = body.forceRefresh || false
    
    // Validate
    if (daysBack < 1 || daysBack > 730) {
      return NextResponse.json(
        { error: 'daysBack must be between 1 and 730' },
        { status: 400 }
      )
    }
    
    // Check if there's already an active job
    const activeJobs = await historicalSyncQueue.getActive()
    if (activeJobs.length > 0) {
      return NextResponse.json(
        { 
          error: 'A historical sync is already running',
          activeJob: {
            id: activeJobs[0].id,
            progress: activeJobs[0].progress(),
            startedAt: activeJobs[0].processedOn,
          }
        },
        { status: 409 }
      )
    }
    
    // Queue the job
    const job = await queueHistoricalSync(daysBack, forceRefresh)
    
    return NextResponse.json({
      success: true,
      message: 'Historical sync job queued',
      job: {
        id: job.id,
        daysBack,
        forceRefresh,
      }
    })
    
  } catch (error: any) {
    console.error('Error queuing historical sync:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    
    // If specific job requested
    if (jobId) {
      const job = await historicalSyncQueue.getJob(jobId)
      if (!job) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        )
      }
      
      const state = await job.getState()
      const logs = await job.log('')
      
      return NextResponse.json({
        job: {
          id: job.id,
          state,
          progress: job.progress(),
          data: job.data,
          returnvalue: job.returnvalue,
          failedReason: job.failedReason,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          logs: logs ? logs.split('\n').filter(Boolean) : [],
        }
      })
    }
    
    // Get overall queue status
    const queueStatus = await getHistoricalSyncQueueStatus()
    
    // Get recent jobs
    const [waiting, active, completed, failed] = await Promise.all([
      historicalSyncQueue.getWaiting(0, 5),
      historicalSyncQueue.getActive(0, 5),
      historicalSyncQueue.getCompleted(0, 10),
      historicalSyncQueue.getFailed(0, 10),
    ])
    
    const formatJob = (job: any) => ({
      id: job.id,
      state: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : 'processing',
      progress: job.progress(),
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    })
    
    return NextResponse.json({
      queueStatus,
      jobs: {
        waiting: waiting.map(formatJob),
        active: active.map(formatJob),
        completed: completed.map(formatJob),
        failed: failed.map(formatJob),
      }
    })
    
  } catch (error: any) {
    console.error('Error getting queue status:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Cancel/remove a job
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }
    
    const job = await historicalSyncQueue.getJob(jobId)
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }
    
    await job.remove()
    
    return NextResponse.json({
      success: true,
      message: `Job ${jobId} removed`,
    })
    
  } catch (error: any) {
    console.error('Error removing job:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
