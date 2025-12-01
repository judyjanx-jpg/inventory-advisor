import SellingPartner from 'amazon-sp-api'
import { prisma } from './prisma'

// Marketplace IDs
export const MARKETPLACES = {
  US: 'ATVPDKIKX0DER',
  CA: 'A2EUQ1WTGCTBG2',
  MX: 'A1AM78C64UM0Y8',
  UK: 'A1F83G8C2ARO7P',
  DE: 'A1PA6795UKMFR9',
  FR: 'A13V1IB3VIYBER',
  ES: 'A1RKKUPIHCS9HS',
  IT: 'APJ6JRA9NG5V4',
  NL: 'A1805IZSGTT6HS',
  SE: 'A2NODRKZP88ZB9',
  PL: 'A1C3SOZRARQ6R3',
  AU: 'A39IBJ37TRP1C6',
  JP: 'A1VC38T7YXB528',
  SG: 'A19VAU5U5O7RUS',
  AE: 'A2VIGQ35RCS4UG',
  IN: 'A21TJRUUN4KGV',
  BR: 'A2Q3Y263D00KWC',
}

export interface AmazonCredentials {
  sellerId: string
  marketplaceId: string
  clientId: string
  clientSecret: string
  refreshToken: string
  region?: string
}

// Get stored credentials
export async function getAmazonCredentials(): Promise<AmazonCredentials | null> {
  const connection = await prisma.apiConnection.findFirst({
    where: { platform: 'amazon' },
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

// Create SP-API client with timeout
export async function createSpApiClient(): Promise<SellingPartner | null> {
  const credentials = await getAmazonCredentials()

  if (!credentials) {
    throw new Error('Amazon credentials not configured')
  }

  const client = new SellingPartner({
    region: credentials.region || 'na', // na, eu, fe
    refresh_token: credentials.refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: credentials.clientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: credentials.clientSecret,
    },
    options: {
      auto_request_tokens: true,
      auto_request_throttled: true,
      use_sandbox: false,
      // Add timeouts to prevent hanging
      timeouts: {
        response: 60000,  // 60 seconds for response
        deadline: 120000, // 120 seconds total deadline
      },
    },
  })

  return client
}

// Wrapper to call API with timeout (fallback if library timeout doesn't work)
export async function callApiWithTimeout<T>(
  client: SellingPartner,
  params: any,
  timeoutMs: number = 60000
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const result = await Promise.race([
      client.callAPI(params),
      new Promise<never>((_, reject) => {
        const checkAbort = setInterval(() => {
          if (controller.signal.aborted) {
            clearInterval(checkAbort)
            reject(new Error(`API request timed out after ${timeoutMs / 1000}s`))
          }
        }, 100)
      }),
    ])
    clearTimeout(timeoutId)
    return result as T
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError' || error.message.includes('timed out')) {
      throw new Error(`API request timed out after ${timeoutMs / 1000}s`)
    }
    throw error
  }
}

// Update sync status
export async function updateSyncStatus(
  status: 'running' | 'success' | 'error',
  error?: string
) {
  const data: any = {
    lastSyncAt: new Date(),
    lastSyncStatus: status,
  }

  if (status === 'success') {
    data.lastSuccessfulSync = new Date()
    data.consecutiveFailures = 0
    data.lastSyncError = null
  } else if (status === 'error') {
    data.lastSyncError = error
    data.consecutiveFailures = { increment: 1 }
  }

  await prisma.apiConnection.update({
    where: { platform: 'amazon' },
    data,
  })
}

// Helper to convert marketplace ID to channel code
export function marketplaceToChannel(marketplaceId: string): string {
  const mapping: Record<string, string> = {
    [MARKETPLACES.US]: 'amazon_us',
    [MARKETPLACES.UK]: 'amazon_uk',
    [MARKETPLACES.CA]: 'amazon_ca',
    [MARKETPLACES.DE]: 'amazon_de',
    [MARKETPLACES.FR]: 'amazon_fr',
    [MARKETPLACES.ES]: 'amazon_es',
    [MARKETPLACES.IT]: 'amazon_it',
    [MARKETPLACES.AU]: 'amazon_au',
    [MARKETPLACES.JP]: 'amazon_jp',
    [MARKETPLACES.MX]: 'amazon_mx',
    [MARKETPLACES.BR]: 'amazon_br',
  }
  return mapping[marketplaceId] || 'amazon_us'
}