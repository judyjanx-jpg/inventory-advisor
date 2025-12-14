/**
 * Multi-Channel Support Integration Architecture
 *
 * This module provides a unified interface for handling customer messages
 * from different sales channels (Amazon, Shopify, Walmart, Email, etc.)
 *
 * Each channel adapter implements the ChannelAdapter interface to:
 * - Fetch messages from the channel
 * - Send replies back to the channel
 * - Convert messages to support tickets
 */

import { prisma } from '@/lib/prisma'
import { sendTicketConfirmation } from '@/lib/email'

// ============================================
// Types & Interfaces
// ============================================

export type ChannelType = 'AMAZON' | 'SHOPIFY' | 'WALMART' | 'EMAIL' | 'CHAT' | 'FORM'

export interface ChannelMessage {
  channelMessageId: string
  channelOrderId?: string
  channel: ChannelType
  threadId?: string
  parentMessageId?: string

  senderType: 'CUSTOMER' | 'MERCHANT'
  senderEmail?: string
  senderName?: string

  subject?: string
  body: string
  html?: string
  attachments?: ChannelAttachment[]

  createdAt: Date
  requiresResponse?: boolean
  responseDeadline?: Date

  metadata?: Record<string, any>
}

export interface ChannelAttachment {
  name: string
  url?: string
  contentType?: string
  size?: number
  content?: string // Base64 for inline attachments
}

export interface ChannelReply {
  ticketId: number
  body: string
  html?: string
  attachments?: ChannelAttachment[]
}

export interface SyncResult {
  messagesSynced: number
  ticketsCreated: number
  errors: string[]
}

// ============================================
// Channel Adapter Interface
// ============================================

export interface ChannelAdapter {
  readonly channel: ChannelType

  /**
   * Check if the channel is properly configured
   */
  isConfigured(): Promise<boolean>

  /**
   * Fetch new messages from the channel
   * @param since Only fetch messages after this date
   * @param orderId Optional: only fetch messages for specific order
   */
  fetchMessages(since?: Date, orderId?: string): Promise<ChannelMessage[]>

  /**
   * Send a reply to a channel message
   */
  sendReply(originalMessageId: string, reply: ChannelReply): Promise<boolean>

  /**
   * Mark a message as read/handled in the channel
   */
  markAsRead?(messageId: string): Promise<boolean>
}

// ============================================
// Base Implementation & Utilities
// ============================================

// Generate a unique ticket number
function generateTicketNumber(): string {
  const random = Math.floor(Math.random() * 900000) + 100000
  return `TKT-${random}`
}

// Categorize message based on content
function categorizeMessage(subject: string, body: string): string {
  const combined = `${subject} ${body}`.toLowerCase()

  if (combined.includes('warranty') || combined.includes('broken') || combined.includes('defect')) {
    return 'WARRANTY'
  }
  if (combined.includes('ship') || combined.includes('delivery') || combined.includes('track')) {
    return 'SHIPPING'
  }
  if (combined.includes('return') || combined.includes('refund') || combined.includes('exchange')) {
    return 'ORDER'
  }
  if (combined.includes('size') || combined.includes('color') || combined.includes('product')) {
    return 'PRODUCT'
  }
  return 'OTHER'
}

/**
 * Convert a channel message to a support ticket
 */
export async function createTicketFromChannelMessage(
  message: ChannelMessage
): Promise<{ ticketId: number; ticketNumber: string } | null> {
  try {
    // Generate unique ticket number
    let ticketNumber = generateTicketNumber()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.supportTicket.findUnique({
        where: { ticketNumber },
      })
      if (!existing) break
      ticketNumber = generateTicketNumber()
      attempts++
    }

    const category = categorizeMessage(message.subject || '', message.body)
    const priority = message.requiresResponse ? 'HIGH' : 'MEDIUM'

    // Create the ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        customerEmail: message.senderEmail || `${message.channel.toLowerCase()}-customer@marketplace`,
        customerName: message.senderName,
        orderId: message.channelOrderId,
        category,
        channel: message.channel,
        subject: message.subject || `${message.channel} Inquiry`,
        status: 'OPEN',
        priority,
      },
    })

    // Create the initial message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'CUSTOMER',
        senderName: message.senderName || `${message.channel} Customer`,
        content: message.body,
        attachments: message.attachments ? JSON.stringify(message.attachments) : null,
      },
    })

    console.log(`[Channels] Created ticket ${ticketNumber} from ${message.channel} message ${message.channelMessageId}`)

    // Send confirmation if we have an email
    if (message.senderEmail && !message.senderEmail.includes('@marketplace')) {
      sendTicketConfirmation({
        to: message.senderEmail,
        customerName: message.senderName || '',
        ticketNumber,
        subject: message.subject || `${message.channel} Inquiry`,
      }).catch(err => console.error('[Channels] Email failed:', err))
    }

    return { ticketId: ticket.id, ticketNumber }
  } catch (error: any) {
    console.error('[Channels] Failed to create ticket:', error.message)
    return null
  }
}

/**
 * Sync messages from a channel and create tickets
 */
export async function syncChannel(
  adapter: ChannelAdapter,
  options: {
    since?: Date
    orderId?: string
    createTickets?: boolean
  } = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    messagesSynced: 0,
    ticketsCreated: 0,
    errors: [],
  }

  const { since, orderId, createTickets = true } = options

  try {
    const isConfigured = await adapter.isConfigured()
    if (!isConfigured) {
      result.errors.push(`${adapter.channel} channel is not configured`)
      return result
    }

    const messages = await adapter.fetchMessages(since, orderId)
    console.log(`[Channels] Fetched ${messages.length} messages from ${adapter.channel}`)

    for (const message of messages) {
      try {
        result.messagesSynced++

        // Only create tickets for customer messages
        if (createTickets && message.senderType === 'CUSTOMER') {
          const ticketResult = await createTicketFromChannelMessage(message)
          if (ticketResult) {
            result.ticketsCreated++
          }
        }

        // Mark as read if adapter supports it
        if (adapter.markAsRead) {
          await adapter.markAsRead(message.channelMessageId)
        }
      } catch (error: any) {
        result.errors.push(`Failed to process message ${message.channelMessageId}: ${error.message}`)
      }
    }

    // Log sync
    await prisma.syncLog.create({
      data: {
        syncType: `${adapter.channel.toLowerCase()}_messages`,
        status: result.errors.length > 0 ? 'partial' : 'success',
        recordsProcessed: result.messagesSynced,
        recordsUpdated: result.ticketsCreated,
        errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
      },
    })

    return result
  } catch (error: any) {
    result.errors.push(error.message)
    return result
  }
}

// ============================================
// Channel Registry
// ============================================

const channelAdapters: Map<ChannelType, ChannelAdapter> = new Map()

export function registerChannelAdapter(adapter: ChannelAdapter) {
  channelAdapters.set(adapter.channel, adapter)
  console.log(`[Channels] Registered adapter for ${adapter.channel}`)
}

export function getChannelAdapter(channel: ChannelType): ChannelAdapter | undefined {
  return channelAdapters.get(channel)
}

export function getRegisteredChannels(): ChannelType[] {
  return Array.from(channelAdapters.keys())
}

/**
 * Sync all registered channels
 */
export async function syncAllChannels(options?: {
  since?: Date
  createTickets?: boolean
}): Promise<Record<ChannelType, SyncResult>> {
  const results: Record<string, SyncResult> = {}

  for (const [channel, adapter] of channelAdapters) {
    console.log(`[Channels] Syncing ${channel}...`)
    results[channel] = await syncChannel(adapter, options)
  }

  return results as Record<ChannelType, SyncResult>
}
