import { NextRequest, NextResponse } from 'next/server'
import { requireInternalAccess } from '@/lib/internal-auth'
import {
  syncChannel,
  syncAllChannels,
  getChannelAdapter,
  registerChannelAdapter,
  getRegisteredChannels,
  type ChannelType,
} from '@/lib/channels'
import { shopifyAdapter } from '@/lib/channels/shopify'
import { walmartAdapter } from '@/lib/channels/walmart'

// Register available channel adapters
// This runs once when the module is loaded
try {
  registerChannelAdapter(shopifyAdapter)
  registerChannelAdapter(walmartAdapter)
} catch (e) {
  // Adapters may already be registered
}

/**
 * Channel Sync API
 *
 * POST /api/support/channels/sync
 * Syncs messages from one or all sales channels
 *
 * Body:
 * - channel?: 'AMAZON' | 'SHOPIFY' | 'WALMART' | 'all' (default: 'all')
 * - since?: ISO date string (default: 7 days ago)
 * - createTickets?: boolean (default: true)
 *
 * Response:
 * - results: Record<channel, { messagesSynced, ticketsCreated, errors }>
 */
export async function POST(request: NextRequest) {
  const authError = requireInternalAccess(request)
  if (authError) return authError

  try {
    const body = await request.json().catch(() => ({}))
    const {
      channel = 'all',
      since,
      createTickets = true,
    } = body

    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Default: 7 days

    const options = { since: sinceDate, createTickets }

    if (channel === 'all') {
      // Sync all registered channels
      const results = await syncAllChannels(options)

      const totalMessages = Object.values(results).reduce((sum, r) => sum + r.messagesSynced, 0)
      const totalTickets = Object.values(results).reduce((sum, r) => sum + r.ticketsCreated, 0)
      const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0)

      return NextResponse.json({
        success: totalErrors === 0,
        results,
        summary: {
          totalMessagesSynced: totalMessages,
          totalTicketsCreated: totalTickets,
          totalErrors,
        },
      })
    } else {
      // Sync specific channel
      const adapter = getChannelAdapter(channel as ChannelType)

      if (!adapter) {
        return NextResponse.json(
          {
            error: `Channel '${channel}' not found`,
            availableChannels: getRegisteredChannels(),
          },
          { status: 400 }
        )
      }

      const result = await syncChannel(adapter, options)

      return NextResponse.json({
        success: result.errors.length === 0,
        channel,
        ...result,
      })
    }
  } catch (error: any) {
    console.error('[Channel Sync] Error:', error)
    return NextResponse.json(
      { error: 'Failed to sync channels', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/support/channels/sync
 * Returns available channels and their status
 */
export async function GET(request: NextRequest) {
  const authError = requireInternalAccess(request)
  if (authError) return authError

  try {
    const channels = getRegisteredChannels()
    const status: Record<string, { registered: boolean; configured: boolean }> = {}

    for (const channel of channels) {
      const adapter = getChannelAdapter(channel)
      status[channel] = {
        registered: true,
        configured: adapter ? await adapter.isConfigured() : false,
      }
    }

    // Also check for channels that might not be registered yet
    const allPossibleChannels: ChannelType[] = ['AMAZON', 'SHOPIFY', 'WALMART', 'EMAIL', 'CHAT', 'FORM']
    for (const channel of allPossibleChannels) {
      if (!status[channel]) {
        status[channel] = { registered: false, configured: false }
      }
    }

    return NextResponse.json({
      channels: status,
      registeredAdapters: channels,
    })
  } catch (error: any) {
    console.error('[Channel Sync] Status error:', error)
    return NextResponse.json(
      { error: 'Failed to get channel status' },
      { status: 500 }
    )
  }
}
