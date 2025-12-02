/**
 * Bull Board Dashboard
 * 
 * Access at: /api/admin/queues
 * 
 * Provides a web UI to monitor and manage your sync jobs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createBullBoard } from '@bull-board/api'
import { BullAdapter } from '@bull-board/api/bullAdapter'
import { allQueues } from '@/lib/queues'

// Create Bull Board instance
let bullBoardApp: any = null

function getBullBoard() {
  if (!bullBoardApp) {
    const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
      queues: allQueues.map(q => new BullAdapter(q)),
      serverAdapter: null as any, // We'll handle routing manually
    })
    bullBoardApp = { addQueue, removeQueue, setQueues, replaceQueues }
  }
  return bullBoardApp
}

export async function GET(request: NextRequest) {
  try {
    // For now, return queue stats in JSON
    // Full Bull Board UI requires Express adapter
    const stats = await Promise.all(
      allQueues.map(async (queue) => {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ])

        const activeJobs = await queue.getActive()
        const failedJobs = await queue.getFailed(0, 4)
        const completedJobs = await queue.getCompleted(0, 4)

        return {
          name: queue.name,
          counts: { waiting, active, completed, failed, delayed },
          activeJobs: activeJobs.map(j => ({
            id: j.id,
            name: j.name,
            progress: j.progress(),
            timestamp: j.timestamp,
          })),
          recentFailed: failedJobs.map(j => ({
            id: j.id,
            name: j.name,
            failedReason: j.failedReason,
            finishedOn: j.finishedOn,
          })),
          recentCompleted: completedJobs.map(j => ({
            id: j.id,
            name: j.name,
            finishedOn: j.finishedOn,
            duration: j.finishedOn && j.processedOn ? j.finishedOn - j.processedOn : null,
          })),
        }
      })
    )

    // Return HTML dashboard
    const html = generateDashboardHTML(stats)
    
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      hint: 'Make sure REDIS_URL is set and Redis is running',
    }, { status: 500 })
  }
}

function generateDashboardHTML(stats: any[]) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Sync Queue Dashboard</title>
  <meta http-equiv="refresh" content="10">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
    h1 { color: #22d3ee; margin-bottom: 20px; }
    .queues { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; }
    .queue { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .queue h2 { color: #f8fafc; font-size: 18px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
    .queue h2 .status { width: 10px; height: 10px; border-radius: 50%; }
    .queue h2 .status.active { background: #22c55e; animation: pulse 1s infinite; }
    .queue h2 .status.idle { background: #64748b; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 15px; }
    .count { text-align: center; padding: 10px; background: #0f172a; border-radius: 8px; }
    .count .num { font-size: 24px; font-weight: bold; }
    .count .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
    .count.waiting .num { color: #fbbf24; }
    .count.active .num { color: #22d3ee; }
    .count.completed .num { color: #22c55e; }
    .count.failed .num { color: #ef4444; }
    .count.delayed .num { color: #a78bfa; }
    .jobs { margin-top: 10px; }
    .jobs h3 { font-size: 12px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; }
    .job { background: #0f172a; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; font-size: 13px; }
    .job.failed { border-left: 3px solid #ef4444; }
    .job.completed { border-left: 3px solid #22c55e; }
    .job .id { color: #64748b; }
    .job .reason { color: #fca5a5; font-size: 12px; }
    .job .time { color: #64748b; font-size: 11px; }
    .refresh { color: #64748b; font-size: 12px; margin-top: 20px; }
    .actions { margin-top: 15px; display: flex; gap: 10px; }
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; }
    .btn-primary { background: #22d3ee; color: #0f172a; }
    .btn-primary:hover { background: #06b6d4; }
  </style>
</head>
<body>
  <h1>🔄 Sync Queue Dashboard</h1>
  
  <div class="actions">
    <button class="btn btn-primary" onclick="triggerSync('all')">Trigger All Syncs</button>
    <button class="btn btn-primary" onclick="triggerSync('orders')">Sync Orders</button>
    <button class="btn btn-primary" onclick="triggerSync('finances')">Sync Fees</button>
    <button class="btn btn-primary" onclick="triggerSync('inventory')">Sync Inventory</button>
  </div>

  <div class="queues" style="margin-top: 20px;">
    ${stats.map(q => `
      <div class="queue">
        <h2>
          <span class="status ${q.counts.active > 0 ? 'active' : 'idle'}"></span>
          ${q.name}
        </h2>
        <div class="counts">
          <div class="count waiting">
            <div class="num">${q.counts.waiting}</div>
            <div class="label">Waiting</div>
          </div>
          <div class="count active">
            <div class="num">${q.counts.active}</div>
            <div class="label">Active</div>
          </div>
          <div class="count completed">
            <div class="num">${q.counts.completed}</div>
            <div class="label">Done</div>
          </div>
          <div class="count failed">
            <div class="num">${q.counts.failed}</div>
            <div class="label">Failed</div>
          </div>
          <div class="count delayed">
            <div class="num">${q.counts.delayed}</div>
            <div class="label">Delayed</div>
          </div>
        </div>
        
        ${q.activeJobs.length > 0 ? `
          <div class="jobs">
            <h3>Active Jobs</h3>
            ${q.activeJobs.map((j: any) => `
              <div class="job">
                <span class="id">#${j.id}</span> ${j.name} - ${j.progress}%
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${q.recentFailed.length > 0 ? `
          <div class="jobs">
            <h3>Recent Failures</h3>
            ${q.recentFailed.slice(0, 2).map((j: any) => `
              <div class="job failed">
                <span class="id">#${j.id}</span> ${j.name}
                <div class="reason">${j.failedReason || 'Unknown error'}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('')}
  </div>

  <p class="refresh">Auto-refreshes every 10 seconds</p>

  <script>
    async function triggerSync(type) {
      try {
        const res = await fetch('/api/sync/trigger?type=' + type, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('Sync triggered: ' + type);
          location.reload();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Failed to trigger sync');
      }
    }
  </script>
</body>
</html>
  `
}


