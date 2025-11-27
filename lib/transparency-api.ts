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
  // Optional AWS credentials for SigV4 signing (if required)
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsRegion?: string
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
    where: { platform: 'transparency' }
  })

  if (!connection?.credentials) return null

  try {
    const creds = typeof connection.credentials === 'string' 
      ? JSON.parse(connection.credentials) 
      : connection.credentials
    return {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
    }
  } catch (error) {
    console.error('Error parsing Transparency credentials:', error)
    return null
  }
}

/**
 * Get OAuth2 access token for Transparency API using Amazon Cognito
 * Uses client_credentials grant type
 */
async function getAccessToken(credentials: TransparencyCredentials): Promise<string> {
  // Amazon Transparency uses OAuth2 client credentials flow
  // Based on working VBA code: use client_id and client_secret in the body (form-encoded)
  // NOT Basic Auth header
  
  const bodyParams = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  })
  
  console.log(`[Transparency] Requesting access token from: ${TRANSPARENCY_AUTH_URL}`)
  
  const response = await fetch(TRANSPARENCY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // NO Authorization header - credentials go in the body
    },
    body: bodyParams.toString(),
  })
  
  console.log(`[Transparency] Auth response status: ${response.status} ${response.statusText}`)

  if (!response.ok) {
    let errorText = ''
    try {
      const errorData = await response.json()
      errorText = errorData.error_description || errorData.error || JSON.stringify(errorData)
    } catch {
      errorText = await response.text()
    }
    console.error('Transparency auth error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    })
    throw new Error(`Failed to authenticate with Transparency API (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  
  console.log(`[Transparency] OAuth response:`, {
    hasAccessToken: !!data.access_token,
    hasTokenType: !!data.token_type,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    scope: data.scope,
    responseKeys: Object.keys(data),
  })
  
  // Validate we got an access token
  if (!data.access_token) {
    console.error('Transparency auth response:', data)
    throw new Error(`No access_token in response: ${JSON.stringify(data)}`)
  }
  
  const token = String(data.access_token).trim()
  const tokenType = data.token_type || 'Bearer'
  
  // Validate token format (should be a JWT or similar, not a hash)
  if (token.length < 50) {
    console.warn(`[Transparency] Access token seems short (${token.length} chars): ${token.substring(0, 20)}...`)
  }
  
  // Check if token is a JWT (starts with eyJ)
  const isJWT = token.startsWith('eyJ')
  console.log(`[Transparency] Successfully obtained access token:`, {
    length: token.length,
    tokenType: tokenType,
    isJWT: isJWT,
    startsWith: token.substring(0, 20),
    firstPart: isJWT ? 'JWT detected' : 'Non-JWT token',
  })
  
  return token
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
 * Based on working VBA code workflow:
 * 1. POST /serial/sgtin - Start async job, returns Location header with job URL
 * 2. Poll job URL - Check status until COMPLETED/DONE
 * 3. Download codes from URL returned in job response
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

    // Normalize GTIN - preserve leading zeros!
    // Remove any non-digit characters but keep the string format to preserve leading zeros
    let normalizedGtin = gtin.replace(/\D/g, '')
    
    // Validate GTIN length (should be 8, 12, 13, or 14 digits per Amazon's requirements)
    // Based on VBA code: use GTIN as-is, don't pad
    if (normalizedGtin.length !== 8 && normalizedGtin.length !== 12 && normalizedGtin.length !== 13 && normalizedGtin.length !== 14) {
      throw new Error(`Invalid GTIN length: ${gtin} (normalized: ${normalizedGtin}, length: ${normalizedGtin.length}). GTIN must be 8, 12, 13, or 14 digits.`)
    }
    
    // Use GTIN as-is (VBA code doesn't pad - it validates and uses directly)
    const finalGtin = normalizedGtin
    
    console.log(`[Transparency] Requesting codes for GTIN: "${gtin}" -> normalized: "${normalizedGtin}" (${normalizedGtin.length} digits, count: ${count})`)

    // Generate a unique requestId (like VBA does with NewGuid)
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
    
    const requestBody = {
      gtin: finalGtin,
      count: count,
      requestId: requestId,
    }
    const requestBodyString = JSON.stringify(requestBody)
    
    const cleanToken = accessToken.trim().replace(/\s+/g, '')
    const authHeader = `Bearer ${cleanToken}`
    
    console.log(`[Transparency] Step 1: Starting serial job`)
    console.log(`[Transparency] Request URL: ${TRANSPARENCY_API_BASE}/serial/sgtin`)
    console.log(`[Transparency] Request body:`, requestBodyString)
    
    // Step 1: POST to /serial/sgtin (returns 202 with Location header)
    const startJobResponse = await fetch(`${TRANSPARENCY_API_BASE}/serial/sgtin`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: requestBodyString,
    })
    
    console.log(`[Transparency] Start job response status: ${startJobResponse.status} ${startJobResponse.statusText}`)
    
    if (startJobResponse.status !== 202) {
      let errorText = ''
      try {
        const errorData = await startJobResponse.json()
        errorText = errorData.message || errorData.error || JSON.stringify(errorData)
      } catch {
        errorText = await startJobResponse.text()
      }
      
      if (startJobResponse.status === 400) {
        throw new Error(`Bad Request (400) - Transparency API rejected this GTIN\n\nGTIN: ${finalGtin}\nRequested: ${count} codes\n\nCommon causes:\n1. GTIN is not enrolled in Transparency program\n2. GTIN format is incorrect\n3. GTIN has invalid characters\n\nAPI Response:\n${errorText}\n\nCheck:\n- Is this GTIN enrolled in Amazon Transparency?\n- Is the GTIN correct?`)
      }
      
      if (startJobResponse.status === 401) {
        throw new Error(`Serial request failed: Unauthorized (401)\n\nYour API credentials may be invalid.\n\n${errorText}`)
      }
      
      throw new Error(`Serial request failed: ${startJobResponse.status}\n\n${errorText}`)
    }
    
    // Get Location header (job URL)
    const jobLocation = startJobResponse.headers.get('Location')
    if (!jobLocation) {
      throw new Error('No Location header (job URL) returned from API')
    }
    
    console.log(`[Transparency] Step 2: Polling job at: ${jobLocation}`)
    
    // Step 2: Poll job URL until status is COMPLETED/DONE
    const maxAttempts = 600 // up to ~10 minutes (600 * 1 second)
    let jobUrl: string | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[Transparency] Polling job, attempt ${attempt}/${maxAttempts}`)
      
      const pollResponse = await fetch(jobLocation, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      })
      
      if (pollResponse.status !== 200) {
        throw new Error(`Job poll failed: ${pollResponse.status}\n${await pollResponse.text()}`)
      }
      
      const pollData = await pollResponse.json()
      const status = (pollData.status || '').toUpperCase()
      
      console.log(`[Transparency] Job status: ${status}`)
      
      if (status === 'DONE' || status === 'COMPLETED' || status === 'COMPLETE') {
        jobUrl = pollData.url
        if (!jobUrl) {
          throw new Error(`Job complete but no URL returned. Response: ${JSON.stringify(pollData)}`)
        }
        console.log(`[Transparency] Step 3: Job completed, downloading codes from: ${jobUrl}`)
        break
      }
      
      if (status === 'FAILED' || status === 'CANCELED') {
        throw new Error(`Job FAILED: ${JSON.stringify(pollData)}`)
      }
      
      // Wait 1 second before next poll
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    if (!jobUrl) {
      throw new Error('Job did not complete within 10 minutes')
    }
    
    // Step 3: Download codes from the URL
    const downloadResponse = await fetch(jobUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
    })
    
    if (downloadResponse.status !== 200) {
      throw new Error(`Download failed: ${downloadResponse.status}\n${await downloadResponse.text()}`)
    }
    
    const downloadText = await downloadResponse.text()
    console.log(`[Transparency] Downloaded ${downloadText.length} bytes`)
    console.log(`[Transparency] First 200 chars of response:`, downloadText.substring(0, 200))
    
    // Step 4: Parse codes (can be JSON with "codes" array or plain text line-by-line)
    const codes: string[] = []
    
    // Try to parse as JSON first
    try {
      const jsonData = JSON.parse(downloadText)
      console.log(`[Transparency] Parsed JSON, keys:`, Object.keys(jsonData))
      
      // Check for nested structure: codesList[0].codes (what we're seeing)
      if (jsonData.codesList && Array.isArray(jsonData.codesList) && jsonData.codesList.length > 0) {
        const codesList = jsonData.codesList[0]
        if (codesList.codes && Array.isArray(codesList.codes)) {
          codes.push(...codesList.codes.map((c: any) => String(c).trim()).filter((c: string) => c !== ''))
          console.log(`[Transparency] Extracted ${codes.length} codes from codesList[0].codes`)
        }
      }
      // Check for direct "codes" array at root
      else if (jsonData.codes && Array.isArray(jsonData.codes)) {
        codes.push(...jsonData.codes.map((c: any) => String(c).trim()).filter((c: string) => c !== ''))
        console.log(`[Transparency] Extracted ${codes.length} codes from root codes array`)
      }
    } catch (e) {
      console.warn('[Transparency] Failed to parse as JSON, trying line-by-line:', e)
    }
    
    // If no codes yet, try line-by-line parsing (plain text format)
    if (codes.length === 0) {
      const lines = downloadText.split(/\r?\n/)
      console.log(`[Transparency] Parsing as plain text, found ${lines.length} lines`)
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed !== '') {
          codes.push(trimmed)
        }
      }
      console.log(`[Transparency] Extracted ${codes.length} codes from plain text`)
    }
    
    // Log what we got vs what was requested
    console.log(`[Transparency] Retrieved ${codes.length} codes, requested ${count}`)
    
    if (codes.length === 0) {
      throw new Error(`No codes returned from Transparency API`)
    }
    
    // Filter out any codes that look like UPCs/GTINs (8-14 digits only)
    // The GTIN we sent might be included in the response - filter it out
    const validCodes = codes.filter((code: string) => {
      const codeStr = String(code).trim()
      // UPCs/GTINs are typically 8-14 digits with no other characters
      const isOnlyDigits = /^\d+$/.test(codeStr)
      const isUPCLength = codeStr.length >= 8 && codeStr.length <= 14
      const looksLikeUPC = isOnlyDigits && isUPCLength
      
      // Also check if it matches the GTIN we sent
      if (codeStr === finalGtin || codeStr === normalizedGtin) {
        console.warn(`[Transparency] Filtered out GTIN that was sent in request: "${codeStr}"`)
        return false
      }
      
      if (looksLikeUPC) {
        console.warn(`[Transparency] Filtered out potential UPC/GTIN code: "${codeStr}" (length: ${codeStr.length})`)
        return false
      }
      
      // Transparency codes should be at least 15 characters
      if (codeStr.length < 15) {
        console.warn(`[Transparency] Filtered out suspiciously short code: "${codeStr}" (length: ${codeStr.length})`)
        return false
      }
      
      return true
    })
    
    if (validCodes.length < codes.length) {
      console.warn(`[Transparency] Filtered out ${codes.length - validCodes.length} invalid codes (UPCs/GTINs) from ${codes.length} total codes`)
    }
    
    if (validCodes.length === 0) {
      throw new Error(`No valid Transparency codes returned (all codes were filtered as UPCs/GTINs)`)
    }
    
    // Return what we got (may be less than requested if API has limits or filtering)
    if (validCodes.length < count) {
      console.warn(`[Transparency] Warning: Got fewer valid codes (${validCodes.length}) than requested (${count})`)
    }
    
    console.log(`[Transparency] Successfully retrieved ${validCodes.length} valid codes. First code preview: "${validCodes[0]?.substring(0, 30)}..."`)
    return validCodes.slice(0, count) // Return up to the requested count
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

