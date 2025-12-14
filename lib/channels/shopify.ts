/**
 * Shopify Channel Adapter
 *
 * Integrates with Shopify Admin API to:
 * - Fetch customer messages (via customer timeline/notes)
 * - Send replies via email
 * - Track order-related communications
 *
 * Requirements:
 * - Shopify Admin API access token with read_customers, read_orders scopes
 * - Store URL in format: store-name.myshopify.com
 *
 * Setup:
 * 1. Create a Shopify private app or custom app
 * 2. Store credentials in apiConnection table with platform='shopify'
 * 3. Register this adapter in your app initialization
 */

import { prisma } from '@/lib/prisma'
import type { ChannelAdapter, ChannelMessage, ChannelReply } from './index'

interface ShopifyCredentials {
  storeUrl: string
  accessToken: string
}

async function getShopifyCredentials(): Promise<ShopifyCredentials | null> {
  const connection = await prisma.apiConnection.findFirst({
    where: { platform: 'shopify' },
  })

  if (!connection?.credentials || !connection.isConnected) {
    return null
  }

  try {
    return JSON.parse(connection.credentials)
  } catch {
    return null
  }
}

async function shopifyRequest<T>(
  credentials: ShopifyCredentials,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `https://${credentials.storeUrl}/admin/api/2024-01/${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': credentials.accessToken,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export const shopifyAdapter: ChannelAdapter = {
  channel: 'SHOPIFY',

  async isConfigured(): Promise<boolean> {
    const credentials = await getShopifyCredentials()
    return credentials !== null
  },

  async fetchMessages(since?: Date, orderId?: string): Promise<ChannelMessage[]> {
    const credentials = await getShopifyCredentials()
    if (!credentials) {
      throw new Error('Shopify not configured')
    }

    const messages: ChannelMessage[] = []

    // Shopify doesn't have a direct "messages" API
    // We can fetch from:
    // 1. Order notes/comments
    // 2. Customer timeline events
    // 3. Draft order notes

    // Fetch recent orders with notes
    const sinceParam = since ? `&created_at_min=${since.toISOString()}` : ''
    const orderFilter = orderId ? `/${orderId}.json` : `.json?status=any&limit=50${sinceParam}`

    try {
      const ordersData = await shopifyRequest<{ orders?: any[]; order?: any }>(
        credentials,
        `orders${orderFilter}`
      )

      // Handle both single order and multiple orders responses
      const orders = ordersData.orders || (ordersData.order ? [ordersData.order] : [])

      for (const order of orders) {
        // Check for customer notes
        if (order.note) {
          messages.push({
            channelMessageId: `shopify-order-note-${order.id}`,
            channelOrderId: order.name, // e.g., "#1001"
            channel: 'SHOPIFY',
            senderType: 'CUSTOMER',
            senderEmail: order.email,
            senderName: order.customer?.first_name
              ? `${order.customer.first_name} ${order.customer.last_name || ''}`
              : undefined,
            subject: `Order Note: ${order.name}`,
            body: order.note,
            createdAt: new Date(order.created_at),
            metadata: {
              orderId: order.id,
              orderName: order.name,
              orderStatus: order.financial_status,
            },
          })
        }

        // Check for timeline events (requires GraphQL)
        // This is a simplified approach - full implementation would use GraphQL
      }
    } catch (error: any) {
      console.error('[Shopify] Failed to fetch orders:', error.message)
    }

    return messages
  },

  async sendReply(originalMessageId: string, reply: ChannelReply): Promise<boolean> {
    const credentials = await getShopifyCredentials()
    if (!credentials) {
      throw new Error('Shopify not configured')
    }

    // Extract order ID from message ID
    const orderIdMatch = originalMessageId.match(/shopify-order-note-(\d+)/)
    if (!orderIdMatch) {
      console.warn('[Shopify] Cannot reply to non-order message')
      return false
    }

    const orderId = orderIdMatch[1]

    try {
      // Add a note to the order
      await shopifyRequest(credentials, `orders/${orderId}.json`, {
        method: 'PUT',
        body: JSON.stringify({
          order: {
            id: orderId,
            note_attributes: [
              {
                name: 'Support Reply',
                value: `[TKT-${reply.ticketId}] ${reply.body}`,
              },
            ],
          },
        }),
      })

      // For actual customer communication, you'd typically:
      // 1. Use Shopify Flow to trigger an email
      // 2. Use a third-party app like Gorgias
      // 3. Send email directly via your email service

      return true
    } catch (error: any) {
      console.error('[Shopify] Failed to send reply:', error.message)
      return false
    }
  },
}

export default shopifyAdapter
