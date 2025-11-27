/**
 * Amazon Transparency API Integration
 * 
 * This module handles authentication and code requests from Amazon's Transparency program.
 * Transparency codes are unique 2D barcodes that verify product authenticity.
 */

import { prisma } from './prisma'

const TRANSPARENCY_API_BASE = 'https://api.transparency.amazon.com'
const TRANSPARENCY_AUTH_URL = 'https://api.amazon.com/auth/o2/token'

interface TransparencyCredentials {
  clientId: string
  clientSecret: string
}

interface TransparencyCodeResponse {
  codes: string[]
  serialNumbers: string[]
}

/**
 * Get stored Transparency API credentials
 */
export async function getTransparencyCredentials(): Promise<TransparencyCredentials | null> {
  const connection = await prisma.apiConnection.findFirst({
    where: { name: 'transparency' }
  })

  if (!connection?.credentials) return null

  const creds = connection.credentials as any
  return {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  }
}

/**
 * Get OAuth2 access token for Transparency API
 */
async function getAccessToken(credentials: TransparencyCredentials): Promise<string> {
  const response = await fetch(TRANSPARENCY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: 'transparency:codes:read transparency:codes:request',
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Transparency auth error:', error)
    throw new Error(`Failed to authenticate with Transparency API: ${response.status}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Request Transparency codes for a specific GTIN/ASIN
 * 
 * @param gtin - The GTIN (UPC/EAN) or ASIN of the product
 * @param quantity - Number of codes to request
 * @returns Array of Transparency codes
 */
export async function requestTransparencyCodes(
  gtin: string,
  quantity: number
): Promise<string[]> {
  const credentials = await getTransparencyCredentials()
  
  if (!credentials) {
    throw new Error('Transparency API credentials not configured')
  }

  try {
    const accessToken = await getAccessToken(credentials)

    // Request codes from Transparency API
    const response = await fetch(`${TRANSPARENCY_API_BASE}/v1/items/${gtin}/codes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
      body: JSON.stringify({
        quantity,
        format: 'SERIAL_NUMBER', // Returns serial numbers that can be encoded as QR codes
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Transparency API error:', error)
      
      // If the product isn't enrolled in Transparency, return empty
      if (response.status === 404) {
        console.log(`Product ${gtin} not enrolled in Transparency program`)
        return []
      }
      
      throw new Error(`Failed to get Transparency codes: ${response.status}`)
    }

    const data: TransparencyCodeResponse = await response.json()
    return data.serialNumbers || data.codes || []
  } catch (error) {
    console.error('Error requesting Transparency codes:', error)
    throw error
  }
}

/**
 * Get existing unused Transparency codes for a product
 * (For products that have codes pre-generated)
 */
export async function getExistingTransparencyCodes(
  gtin: string,
  quantity: number
): Promise<string[]> {
  const credentials = await getTransparencyCredentials()
  
  if (!credentials) {
    throw new Error('Transparency API credentials not configured')
  }

  try {
    const accessToken = await getAccessToken(credentials)

    const response = await fetch(
      `${TRANSPARENCY_API_BASE}/v1/items/${gtin}/codes?status=UNUSED&limit=${quantity}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-amz-access-token': accessToken,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return []
      }
      throw new Error(`Failed to get existing codes: ${response.status}`)
    }

    const data = await response.json()
    return data.codes || data.serialNumbers || []
  } catch (error) {
    console.error('Error getting existing Transparency codes:', error)
    throw error
  }
}

/**
 * Check if a product is enrolled in Transparency
 */
export async function isProductEnrolled(gtin: string): Promise<boolean> {
  const credentials = await getTransparencyCredentials()
  
  if (!credentials) {
    return false
  }

  try {
    const accessToken = await getAccessToken(credentials)

    const response = await fetch(`${TRANSPARENCY_API_BASE}/v1/items/${gtin}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    })

    return response.ok
  } catch (error) {
    console.error('Error checking Transparency enrollment:', error)
    return false
  }
}

