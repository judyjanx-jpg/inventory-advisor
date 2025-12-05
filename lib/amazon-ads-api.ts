// lib/amazon-ads-api.ts
// Amazon Ads API client and helpers

import { prisma } from './prisma'

// Amazon Ads API endpoints
const ADS_API_BASE = 'https://advertising-api.amazon.com'
const ADS_AUTH_URL = 'https://www.amazon.com/ap/oa'
const ADS_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'

// Scopes needed for Ads API
const ADS_SCOPES = 'advertising::campaign_management'

interface AdsCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string
  accessTokenExpiry?: number
  profileId?: string  // Amazon Ads profile ID (like seller ID)
}

interface AdsProfile {
  profileId: number
  countryCode: string
  currencyCode: string
  timezone: string
  accountInfo: {
    marketplaceStringId: string
    id: string
    type: string  // 'seller' or 'vendor'
    name: string
  }
}

// Generate OAuth authorization URL
export function getAdsAuthUrl(): string {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID
  const redirectUri = process.env.AMAZON_ADS_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('Amazon Ads API credentials not configured')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: ADS_SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
  })

  return `${ADS_AUTH_URL}?${params.toString()}`
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID
  const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET
  const redirectUri = process.env.AMAZON_ADS_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Amazon Ads API credentials not configured')
  }

  const response = await fetch(ADS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const clientId = process.env.AMAZON_ADS_CLIENT_ID
  const clientSecret = process.env.AMAZON_ADS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Amazon Ads API credentials not configured')
  }

  const response = await fetch(ADS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

// Get stored Ads credentials
export async function getAdsCredentials(): Promise<AdsCredentials | null> {
  const connection = await prisma.apiConnection.findFirst({
    where: { platform: 'amazon_ads' },
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

// Save Ads credentials
export async function saveAdsCredentials(credentials: AdsCredentials): Promise<void> {
  await prisma.apiConnection.upsert({
    where: { platform: 'amazon_ads' },
    create: {
      platform: 'amazon_ads',
      isConnected: true,
      isPrimary: false,
      provides: JSON.stringify(['advertising']),
      credentials: JSON.stringify(credentials),
      syncEnabled: true,
      syncFrequencyMinutes: 1440, // Daily
    },
    update: {
      isConnected: true,
      credentials: JSON.stringify(credentials),
      updatedAt: new Date(),
    },
  })
}

// Get valid access token (refreshes if expired)
async function getValidAccessToken(): Promise<string> {
  const credentials = await getAdsCredentials()

  if (!credentials) {
    throw new Error('Amazon Ads not connected')
  }

  // Check if current token is still valid (with 5 min buffer)
  const now = Date.now()
  if (credentials.accessToken && credentials.accessTokenExpiry && credentials.accessTokenExpiry > now + 300000) {
    return credentials.accessToken
  }

  // Refresh the token
  const { accessToken, expiresIn } = await refreshAccessToken(credentials.refreshToken)

  // Update stored credentials
  credentials.accessToken = accessToken
  credentials.accessTokenExpiry = now + (expiresIn * 1000)
  await saveAdsCredentials(credentials)

  return accessToken
}

// Make authenticated API request
export async function adsApiRequest<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: any
    profileId?: string
  } = {}
): Promise<T> {
  const accessToken = await getValidAccessToken()
  const credentials = await getAdsCredentials()

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
    'Content-Type': 'application/json',
  }

  // Profile ID is required for most endpoints
  const profileId = options.profileId || credentials?.profileId
  if (profileId) {
    headers['Amazon-Advertising-API-Scope'] = profileId
  }

  const response = await fetch(`${ADS_API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ads API error (${response.status}): ${error}`)
  }

  return response.json()
}

// Get list of advertising profiles (sellers/vendors linked to this account)
export async function getAdsProfiles(): Promise<AdsProfile[]> {
  return adsApiRequest<AdsProfile[]>('/v2/profiles')
}

// ============================================================
// Campaign Data Fetching
// ============================================================

interface Campaign {
  campaignId: number
  name: string
  campaignType: string
  targetingType: string
  state: string
  dailyBudget: number
  startDate: string
  endDate?: string
}

// Get Sponsored Products campaigns
export async function getSpCampaigns(profileId: string): Promise<Campaign[]> {
  return adsApiRequest<Campaign[]>('/v2/sp/campaigns', { profileId })
}

// Get Sponsored Brands campaigns
export async function getSbCampaigns(profileId: string): Promise<Campaign[]> {
  return adsApiRequest<Campaign[]>('/v2/hsa/campaigns', { profileId })
}

// Get Sponsored Display campaigns
export async function getSdCampaigns(profileId: string): Promise<Campaign[]> {
  return adsApiRequest<Campaign[]>('/sd/campaigns', { profileId })
}

// ============================================================
// Report Generation (Async Process)
// ============================================================

interface ReportRequest {
  reportDate: string  // YYYY-MM-DD
  metrics: string[]
}

interface ReportResponse {
  reportId: string
  status: string
  statusDetails?: string
  location?: string  // Download URL when ready
}

// Request a Sponsored Products report
export async function requestSpReport(
  profileId: string,
  reportDate: string,
  recordType: 'campaigns' | 'adGroups' | 'keywords' | 'productAds' = 'campaigns',
  metrics: string[] = [
    'impressions', 'clicks', 'cost', 'attributedConversions14d',
    'attributedSales14d', 'attributedUnitsOrdered14d'
  ]
): Promise<ReportResponse> {
  return adsApiRequest<ReportResponse>(`/v2/sp/${recordType}/report`, {
    method: 'POST',
    profileId,
    body: {
      reportDate,
      metrics,
    },
  })
}

// Check report status
export async function getReportStatus(reportId: string, profileId: string): Promise<ReportResponse> {
  return adsApiRequest<ReportResponse>(`/v2/reports/${reportId}`, { profileId })
}

// Download report (returns gzipped JSON)
export async function downloadReport(location: string): Promise<any[]> {
  const response = await fetch(location)

  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`)
  }

  // Report is gzipped JSON - need to decompress
  const buffer = await response.arrayBuffer()
  
  // Use built-in decompression if available, otherwise return raw
  try {
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(buffer))
    return JSON.parse(decompressed.toString())
  } catch {
    // If decompression fails, try parsing as plain JSON
    const text = new TextDecoder().decode(buffer)
    return JSON.parse(text)
  }
}

// Wait for report to complete and download
export async function waitForReportAndDownload(
  reportId: string,
  profileId: string,
  maxWaitMs: number = 300000  // 5 minutes
): Promise<any[]> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getReportStatus(reportId, profileId)

    if (status.status === 'SUCCESS' && status.location) {
      return downloadReport(status.location)
    }

    if (status.status === 'FAILURE') {
      throw new Error(`Report failed: ${status.statusDetails}`)
    }

    // Wait 5 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  throw new Error('Report timed out')
}

// ============================================================
// High-Level Data Sync Functions
// ============================================================

export interface AdsDailyData {
  date: string
  campaignId: string
  campaignName: string
  campaignType: 'SP' | 'SB' | 'SD'
  impressions: number
  clicks: number
  cost: number
  sales14d: number
  orders14d: number
  units14d: number
  acos: number | null
}

// Sync advertising data for a date range
export async function syncAdsData(
  startDate: string,
  endDate: string,
  onProgress?: (message: string) => void
): Promise<AdsDailyData[]> {
  const credentials = await getAdsCredentials()

  if (!credentials?.profileId) {
    throw new Error('Amazon Ads not connected or no profile selected')
  }

  const profileId = credentials.profileId
  const allData: AdsDailyData[] = []

  // Generate array of dates
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  onProgress?.(`Syncing ${dates.length} days of ad data...`)

  for (const date of dates) {
    onProgress?.(`Processing ${date}...`)

    try {
      // Request Sponsored Products campaign report
      const reportRequest = await requestSpReport(profileId, date, 'campaigns')
      const reportData = await waitForReportAndDownload(reportRequest.reportId, profileId)

      for (const row of reportData) {
        allData.push({
          date,
          campaignId: row.campaignId?.toString(),
          campaignName: row.campaignName,
          campaignType: 'SP',
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          cost: row.cost || 0,
          sales14d: row.attributedSales14d || 0,
          orders14d: row.attributedConversions14d || 0,
          units14d: row.attributedUnitsOrdered14d || 0,
          acos: row.cost && row.attributedSales14d
            ? (row.cost / row.attributedSales14d) * 100
            : null,
        })
      }
    } catch (error: any) {
      onProgress?.(`Warning: Failed to get SP data for ${date}: ${error.message}`)
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return allData
}
