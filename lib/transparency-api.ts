/**
 * Amazon Transparency API Integration
 * 
 * This module handles authentication and code requests from Amazon's Transparency program.
 * Transparency codes are unique 2D barcodes that verify product authenticity.
 * 
 * Documentation: https://transparency.amazon.com/v2/help/api-onboarding
 * 
 * Endpoints:
 * - Auth (Production): https://tpncy-web-services.auth.us-east-1.amazoncognito.com/oauth2/token
 * - API (Production): https://api.transparency.com/v1.2
 */

import { prisma } from './prisma'

// Production endpoints (use sandbox for testing)
const TRANSPARENCY_AUTH_URL = 'https://tpncy-web-services.auth.us-east-1.amazoncognito.com/oauth2/token'
const TRANSPARENCY_API_BASE = 'https://api.transparency.com/v1.2'

// Sandbox endpoints (for testing)
// const TRANSPARENCY_AUTH_URL = 'https://tpncy-web-services-sandbox.auth.us-east-1.amazoncognito.com/oauth2/token'
// const TRANSPARENCY_API_BASE = 'https://api-sandbox.transparency.com/v1.2'

interface TransparencyCredentials {
  clientId: string
  clientSecret: string
}

interface TransparencyCodeResponse {
  jobId: string
  status: string
  serialNumbers?: string[]
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
 * Get OAuth2 access token for Transparency API using Amazon Cognito
 * Uses client_credentials grant type
 */
async function getAccessToken(credentials: TransparencyCredentials): Promise<string> {
  // Create Basic Auth header from client_id:client_secret
  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')
  
  const response = await fetch(TRANSPARENCY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Transparency auth error:', error)
    throw new Error(`Failed to authenticate with Transparency API: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Test credentials by attempting to get an access token
 */
export async function testTransparencyCredentials(
  clientId: string, 
  clientSecret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    
    const response = await fetch(TRANSPARENCY_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }).toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `Authentication failed: ${error}` }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Request Transparency serial numbers for a specific GTIN
 * 
 * According to the API docs:
 * - POST /sn/generate - Request serial numbers
 * - GET /sn/status/{jobId} - Check status
 * - GET /sn/{jobId} - Get serial numbers
 * 
 * @param gtin - The GTIN (UPC/EAN) of the product (12-14 digits)
 * @param count - Number of codes to request (1 to 100,000)
 * @returns Array of Transparency serial numbers
 */
export async function requestTransparencyCodes(
  gtin: string,
  count: number
): Promise<string[]> {
  const credentials = await getTransparencyCredentials()
  
  if (!credentials) {
    throw new Error('Transparency API credentials not configured')
  }

  try {
    const accessToken = await getAccessToken(credentials)

    // Step 1: Request serial number generation
    const generateResponse = await fetch(`${TRANSPARENCY_API_BASE}/sn/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gtin: gtin.padStart(14, '0'), // Ensure 14-digit GTIN format
        count: count,
      }),
    })

    if (!generateResponse.ok) {
      const error = await generateResponse.text()
      console.error('Transparency generate error:', error)
      
      if (generateResponse.status === 404 || generateResponse.status === 400) {
        console.log(`Product GTIN ${gtin} not enrolled in Transparency program`)
        return []
      }
      
      throw new Error(`Failed to request Transparency codes: ${generateResponse.status}`)
    }

    const generateData = await generateResponse.json()
    const jobId = generateData.jobId

    if (!jobId) {
      throw new Error('No job ID returned from Transparency API')
    }

    // Step 2: Poll for job completion (with timeout)
    let attempts = 0
    const maxAttempts = 30 // 30 seconds max wait
    let status = 'PENDING'

    while (status !== 'COMPLETED' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const statusResponse = await fetch(`${TRANSPARENCY_API_BASE}/sn/status/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        status = statusData.status
        
        if (status === 'FAILED') {
          throw new Error('Transparency code generation failed')
        }
      }
      
      attempts++
    }

    if (status !== 'COMPLETED') {
      throw new Error('Transparency code generation timed out')
    }

    // Step 3: Get the serial numbers
    const getResponse = await fetch(`${TRANSPARENCY_API_BASE}/sn/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!getResponse.ok) {
      throw new Error(`Failed to get Transparency codes: ${getResponse.status}`)
    }

    const data = await getResponse.json()
    return data.serialNumbers || []
  } catch (error) {
    console.error('Error requesting Transparency codes:', error)
    throw error
  }
}

/**
 * Get existing unused Transparency codes for a product
 * Note: This may not be supported by all API versions
 */
export async function getExistingTransparencyCodes(
  gtin: string,
  quantity: number
): Promise<string[]> {
  // The Transparency API primarily generates new codes on demand
  // Existing code retrieval may require different endpoints based on your setup
  // For now, we'll just request new codes
  return []
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

    // Try to request 0 codes to check if GTIN is valid
    const response = await fetch(`${TRANSPARENCY_API_BASE}/sn/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gtin: gtin.padStart(14, '0'),
        count: 0, // Just checking validity
      }),
    })

    // 400 with specific error means enrolled but invalid count
    // 404 means not enrolled
    return response.status !== 404
  } catch (error) {
    console.error('Error checking Transparency enrollment:', error)
    return false
  }
}

