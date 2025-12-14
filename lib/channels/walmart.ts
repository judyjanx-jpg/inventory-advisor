/**
 * Walmart Channel Adapter
 *
 * Integrates with Walmart Marketplace API to:
 * - Fetch customer questions and messages
 * - Send replies to customers
 * - Handle order inquiries
 *
 * Requirements:
 * - Walmart Marketplace API credentials (Client ID + Client Secret)
 * - Approved for Partner API access
 *
 * Walmart API uses:
 * - Authentication: OAuth 2.0 with client credentials
 * - Base URL: https://marketplace.walmartapis.com
 * - Customer Communications: Not directly available - requires case management
 *
 * Note: Walmart's API is primarily for inventory/orders, not direct messaging.
 * Customer communications typically go through Walmart's seller portal or
 * require integration with Walmart's Partner Support API.
 */

import { prisma } from '@/lib/prisma'
import type { ChannelAdapter, ChannelMessage, ChannelReply } from './index'

interface WalmartCredentials {
  clientId: string
  clientSecret: string
  accessToken?: string
  tokenExpiry?: string
}

const WALMART_API_URL = 'https://marketplace.walmartapis.com'
const WALMART_AUTH_URL = 'https://marketplace.walmartapis.com/v3/token'

async function getWalmartCredentials(): Promise<WalmartCredentials | null> {
  const connection = await prisma.apiConnection.findFirst({
    where: { platform: 'walmart' },
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

async function getAccessToken(credentials: WalmartCredentials): Promise<string> {
  // Check if we have a valid cached token
  if (credentials.accessToken && credentials.tokenExpiry) {
    const expiry = new Date(credentials.tokenExpiry)
    if (expiry > new Date(Date.now() + 60000)) { // 1 minute buffer
      return credentials.accessToken
    }
  }

  // Request new token
  const authString = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')

  const response = await fetch(WALMART_AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'WM_SVC.NAME': 'Walmart Marketplace',
      'WM_QOS.CORRELATION_ID': Date.now().toString(),
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error(`Walmart auth failed: ${response.status}`)
  }

  const data = await response.json()

  // Cache the token
  const newExpiry = new Date(Date.now() + (data.expires_in * 1000))
  await prisma.apiConnection.update({
    where: { platform: 'walmart' },
    data: {
      credentials: JSON.stringify({
        ...credentials,
        accessToken: data.access_token,
        tokenExpiry: newExpiry.toISOString(),
      }),
    },
  })

  return data.access_token
}

async function walmartRequest<T>(
  credentials: WalmartCredentials,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken(credentials)

  const response = await fetch(`${WALMART_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
      'WM_SEC.ACCESS_TOKEN': accessToken,
      'WM_SVC.NAME': 'Walmart Marketplace',
      'WM_QOS.CORRELATION_ID': Date.now().toString(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`Walmart API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export const walmartAdapter: ChannelAdapter = {
  channel: 'WALMART',

  async isConfigured(): Promise<boolean> {
    const credentials = await getWalmartCredentials()
    return credentials !== null && !!credentials.clientId && !!credentials.clientSecret
  },

  async fetchMessages(since?: Date, orderId?: string): Promise<ChannelMessage[]> {
    const credentials = await getWalmartCredentials()
    if (!credentials) {
      throw new Error('Walmart not configured')
    }

    const messages: ChannelMessage[] = []

    /**
     * Note: Walmart doesn't have a direct messaging API like Amazon.
     * Customer messages are handled through:
     * 1. Walmart Seller Center (web interface)
     * 2. Order-level notes (limited API access)
     * 3. Return/refund requests (have their own API)
     *
     * For a production implementation, you would:
     * 1. Poll the returns API for new return requests
     * 2. Monitor order statuses for issues
     * 3. Use Walmart's webhook notifications if available
     *
     * The code below shows how to fetch returns which often contain customer messages.
     */

    try {
      // Fetch recent returns (which often include customer messages)
      const returnParams = new URLSearchParams({
        status: 'INITIATED,RECEIVED',
        limit: '50',
      })

      if (since) {
        returnParams.set('createdStartDate', since.toISOString().split('T')[0])
      }

      const returnsData = await walmartRequest<{ elements?: { returnOrder: any }[] }>(
        credentials,
        `/v3/returns?${returnParams}`
      )

      for (const element of returnsData.elements || []) {
        const returnOrder = element.returnOrder
        if (returnOrder?.returnOrderLines) {
          for (const line of returnOrder.returnOrderLines) {
            if (line.returnReason || line.returnComments) {
              messages.push({
                channelMessageId: `walmart-return-${returnOrder.returnOrderId}-${line.returnOrderLineNumber}`,
                channelOrderId: returnOrder.customerOrderId,
                channel: 'WALMART',
                senderType: 'CUSTOMER',
                senderEmail: returnOrder.customerEmailId,
                senderName: returnOrder.customerName?.firstName
                  ? `${returnOrder.customerName.firstName} ${returnOrder.customerName.lastName || ''}`
                  : undefined,
                subject: `Return Request: ${returnOrder.customerOrderId}`,
                body: [
                  `Return Reason: ${line.returnReason || 'Not specified'}`,
                  line.returnComments ? `Comments: ${line.returnComments}` : '',
                  `Item: ${line.item?.productName || line.item?.sku || 'Unknown'}`,
                  `Quantity: ${line.returnQuantity?.unitOfMeasure}: ${line.returnQuantity?.measurementValue}`,
                ].filter(Boolean).join('\n'),
                createdAt: new Date(returnOrder.returnOrderDate || Date.now()),
                requiresResponse: true,
                metadata: {
                  returnOrderId: returnOrder.returnOrderId,
                  returnStatus: returnOrder.returnStatus,
                  refundAmount: line.refundAmount,
                },
              })
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[Walmart] Failed to fetch returns:', error.message)
    }

    // Fetch orders with issues (cancellations, etc.)
    try {
      const orderParams = new URLSearchParams({
        status: 'Cancelled',
        limit: '20',
      })

      if (since) {
        orderParams.set('createdStartDate', since.toISOString())
      }

      const ordersData = await walmartRequest<{ elements?: { order: any }[] }>(
        credentials,
        `/v3/orders?${orderParams}`
      )

      for (const element of ordersData.elements || []) {
        const order = element.order
        if (order?.orderLines) {
          for (const line of order.orderLines) {
            if (line.cancellationReason) {
              messages.push({
                channelMessageId: `walmart-cancel-${order.purchaseOrderId}-${line.lineNumber}`,
                channelOrderId: order.customerOrderId,
                channel: 'WALMART',
                senderType: 'CUSTOMER',
                senderEmail: order.shippingInfo?.postalAddress?.emailAddress,
                senderName: order.shippingInfo?.postalAddress?.name,
                subject: `Order Cancellation: ${order.customerOrderId}`,
                body: `Cancellation Reason: ${line.cancellationReason}\nItem: ${line.item?.productName || line.item?.sku}`,
                createdAt: new Date(order.orderDate || Date.now()),
                metadata: {
                  purchaseOrderId: order.purchaseOrderId,
                  orderStatus: order.orderStatus,
                },
              })
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[Walmart] Failed to fetch cancelled orders:', error.message)
    }

    return messages
  },

  async sendReply(originalMessageId: string, reply: ChannelReply): Promise<boolean> {
    const credentials = await getWalmartCredentials()
    if (!credentials) {
      throw new Error('Walmart not configured')
    }

    // Walmart doesn't have a direct reply API
    // Replies need to go through:
    // 1. Seller Center web interface
    // 2. Email to customer (if email is available)
    // 3. Processing the return/refund

    console.warn('[Walmart] Direct reply not supported - process through Seller Center or email')

    // For returns, you could acknowledge/process the return
    if (originalMessageId.startsWith('walmart-return-')) {
      const returnOrderId = originalMessageId.split('-')[2]
      try {
        // This would acknowledge the return - actual implementation depends on your workflow
        console.log(`[Walmart] Would process return ${returnOrderId} with ticket ${reply.ticketId}`)
        return true
      } catch (error: any) {
        console.error('[Walmart] Failed to process return:', error.message)
      }
    }

    return false
  },
}

export default walmartAdapter
