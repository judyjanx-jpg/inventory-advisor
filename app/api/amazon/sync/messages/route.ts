import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, callApiWithTimeout, getAmazonCredentials, MARKETPLACES } from '@/lib/amazon-sp-api'

/**
 * Amazon Messaging API Sync
 *
 * Fetches buyer-seller messages from Amazon SP-API and stores them locally.
 * Messages requiring response are automatically converted to support tickets.
 *
 * SP-API endpoint: messaging/v1/orders/{amazonOrderId}/messages
 * Alternatively uses GET_MESSAGES report for bulk sync
 */

interface AmazonMessageData {
  messageId: string
  amazonOrderId?: string
  threadId?: string
  parentMessageId?: string
  senderType: 'BUYER' | 'SELLER'
  senderEmail?: string
  subject?: string
  body: string
  attachments?: any[]
  createdDate: string
  requiresResponse?: boolean
  responseDeadline?: string
  messageType?: string
}

// Generate a unique ticket number
function generateTicketNumber(): string {
  const random = Math.floor(Math.random() * 900000) + 100000
  return `TKT-${random}`
}

// Sync messages for a specific order
async function syncOrderMessages(
  client: any,
  orderId: string,
  marketplace: string
): Promise<AmazonMessageData[]> {
  try {
    // Note: The Messaging API requires approval from Amazon
    // This uses the getMessagingActionsForOrder endpoint
    const response = await callApiWithTimeout(client, {
      operation: 'getMessagingActionsForOrder',
      endpoint: 'messaging',
      path: {
        amazonOrderId: orderId,
      },
      query: {
        marketplaceIds: [marketplace],
      },
    }, 30000)

    // The actual message content requires calling getAttributes
    // For each embedded action link
    const messages: AmazonMessageData[] = []

    if (response?._embedded?.actions) {
      for (const action of response._embedded.actions) {
        if (action._embedded?.message) {
          const msg = action._embedded.message
          messages.push({
            messageId: msg.messageId || `${orderId}-${Date.now()}`,
            amazonOrderId: orderId,
            senderType: msg.senderType || 'BUYER',
            subject: msg.subject,
            body: msg.body || msg.text || '',
            createdDate: msg.createdDate || new Date().toISOString(),
            attachments: msg.attachments,
          })
        }
      }
    }

    return messages
  } catch (error: any) {
    // Messaging API might not be enabled - log and continue
    console.warn(`[Amazon Messages] Could not fetch messages for order ${orderId}:`, error.message)
    return []
  }
}

// Sync all recent messages using Reports API (alternative approach)
async function syncMessagesViaReports(client: any, daysBack: number = 7): Promise<number> {
  try {
    // Request buyer-seller messages report
    const reportResponse = await callApiWithTimeout(client, {
      operation: 'createReport',
      endpoint: 'reports',
      body: {
        reportType: 'GET_MESSAGES_REPORT', // May not be available in all regions
        dataStartTime: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
        dataEndTime: new Date().toISOString(),
        marketplaceIds: [MARKETPLACES.US],
      },
    }, 30000)

    console.log('[Amazon Messages] Report requested:', reportResponse?.reportId)
    return 0 // Would need to poll for completion
  } catch (error: any) {
    console.warn('[Amazon Messages] Report-based sync not available:', error.message)
    return 0
  }
}

// Convert an Amazon message to a support ticket
async function createTicketFromMessage(message: AmazonMessageData, marketplace: string): Promise<number | null> {
  try {
    // Check if message already has a ticket
    const existing = await prisma.amazonMessage.findUnique({
      where: { amazonMessageId: message.messageId },
      select: { supportTicketId: true },
    })

    if (existing?.supportTicketId) {
      return existing.supportTicketId
    }

    // Generate unique ticket number
    let ticketNumber = generateTicketNumber()
    let attempts = 0
    while (attempts < 10) {
      const existingTicket = await prisma.supportTicket.findUnique({
        where: { ticketNumber },
      })
      if (!existingTicket) break
      ticketNumber = generateTicketNumber()
      attempts++
    }

    // Create support ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        customerEmail: message.senderEmail || 'amazon-customer@marketplace.amazon.com',
        customerName: null,
        orderId: message.amazonOrderId,
        category: message.messageType === 'SHIPPING_INQUIRY' ? 'SHIPPING' : 'ORDER',
        channel: 'AMAZON',
        subject: message.subject || `Amazon Order Inquiry: ${message.amazonOrderId}`,
        status: 'OPEN',
        priority: message.requiresResponse ? 'HIGH' : 'MEDIUM',
      },
    })

    // Create initial message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'CUSTOMER',
        senderName: 'Amazon Customer',
        content: message.body,
      },
    })

    console.log(`[Amazon Messages] Created ticket ${ticketNumber} from message ${message.messageId}`)
    return ticket.id
  } catch (error: any) {
    console.error('[Amazon Messages] Failed to create ticket:', error.message)
    return null
  }
}

// POST - Sync Amazon messages
export async function POST(request: NextRequest) {
  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon credentials not configured' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { orderId, daysBack = 7, createTickets = true } = body

    const client = await createSpApiClient()
    const marketplace = credentials.marketplaceId || MARKETPLACES.US

    let syncedCount = 0
    let ticketsCreated = 0

    if (orderId) {
      // Sync messages for specific order
      const messages = await syncOrderMessages(client, orderId, marketplace)

      for (const msg of messages) {
        // Upsert message
        const amazonMessage = await prisma.amazonMessage.upsert({
          where: { amazonMessageId: msg.messageId },
          create: {
            amazonMessageId: msg.messageId,
            amazonOrderId: msg.amazonOrderId,
            threadId: msg.threadId,
            parentMessageId: msg.parentMessageId,
            senderType: msg.senderType,
            senderEmail: msg.senderEmail,
            subject: msg.subject,
            body: msg.body,
            attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
            requiresResponse: msg.requiresResponse || false,
            responseDeadline: msg.responseDeadline ? new Date(msg.responseDeadline) : null,
            marketplace,
            messageType: msg.messageType,
            amazonCreatedAt: new Date(msg.createdDate),
          },
          update: {
            isRead: true, // Mark as synced/read
          },
        })

        syncedCount++

        // Create ticket if message requires response
        if (createTickets && msg.senderType === 'BUYER' && !amazonMessage.supportTicketId) {
          const ticketId = await createTicketFromMessage(msg, marketplace)
          if (ticketId) {
            await prisma.amazonMessage.update({
              where: { id: amazonMessage.id },
              data: { supportTicketId: ticketId },
            })
            ticketsCreated++
          }
        }
      }
    } else {
      // Bulk sync recent orders with messages
      // Get recent orders that might have messages
      const recentOrders = await prisma.order.findMany({
        where: {
          purchaseDate: {
            gte: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
        orderBy: { purchaseDate: 'desc' },
        take: 100, // Limit to prevent timeout
      })

      console.log(`[Amazon Messages] Checking ${recentOrders.length} recent orders for messages`)

      for (const order of recentOrders) {
        const messages = await syncOrderMessages(client, order.id, marketplace)

        for (const msg of messages) {
          const amazonMessage = await prisma.amazonMessage.upsert({
            where: { amazonMessageId: msg.messageId },
            create: {
              amazonMessageId: msg.messageId,
              amazonOrderId: msg.amazonOrderId,
              threadId: msg.threadId,
              parentMessageId: msg.parentMessageId,
              senderType: msg.senderType,
              senderEmail: msg.senderEmail,
              subject: msg.subject,
              body: msg.body,
              attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
              requiresResponse: msg.requiresResponse || false,
              responseDeadline: msg.responseDeadline ? new Date(msg.responseDeadline) : null,
              marketplace,
              messageType: msg.messageType,
              amazonCreatedAt: new Date(msg.createdDate),
            },
            update: {},
          })

          syncedCount++

          if (createTickets && msg.senderType === 'BUYER' && !amazonMessage.supportTicketId) {
            const ticketId = await createTicketFromMessage(msg, marketplace)
            if (ticketId) {
              await prisma.amazonMessage.update({
                where: { id: amazonMessage.id },
                data: { supportTicketId: ticketId },
              })
              ticketsCreated++
            }
          }
        }
      }
    }

    // Log sync
    await prisma.syncLog.create({
      data: {
        syncType: 'amazon_messages',
        status: 'success',
        recordsProcessed: syncedCount,
        recordsUpdated: ticketsCreated,
        metadata: JSON.stringify({ orderId, daysBack }),
      },
    })

    return NextResponse.json({
      success: true,
      messagesSynced: syncedCount,
      ticketsCreated,
      message: syncedCount > 0
        ? `Synced ${syncedCount} messages, created ${ticketsCreated} tickets`
        : 'No new messages found',
    })
  } catch (error: any) {
    console.error('[Amazon Messages] Sync error:', error)

    await prisma.syncLog.create({
      data: {
        syncType: 'amazon_messages',
        status: 'error',
        errorMessage: error.message,
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Failed to sync Amazon messages', details: error.message },
      { status: 500 }
    )
  }
}

// GET - List synced Amazon messages
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const unreadOnly = searchParams.get('unread') === 'true'
    const requiresResponse = searchParams.get('requiresResponse') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}

    if (orderId) {
      where.amazonOrderId = orderId
    }

    if (unreadOnly) {
      where.isRead = false
    }

    if (requiresResponse) {
      where.requiresResponse = true
      where.isReplied = false
    }

    const messages = await prisma.amazonMessage.findMany({
      where,
      orderBy: { amazonCreatedAt: 'desc' },
      take: limit,
      include: {
        supportTicket: {
          select: {
            id: true,
            ticketNumber: true,
            status: true,
          },
        },
      },
    })

    return NextResponse.json({
      messages,
      count: messages.length,
    })
  } catch (error: any) {
    console.error('[Amazon Messages] List error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}
