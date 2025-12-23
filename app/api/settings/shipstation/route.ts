import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { shipstation } from '@/lib/shipstation'

/**
 * GET /api/settings/shipstation
 * Get ShipStation API settings and connection status
 */
export async function GET() {
  try {
    // First check if configured via environment
    const isEnvConfigured = shipstation.isConfigured()
    
    // Also check database for credentials
    const connection = await prisma.apiConnection.findFirst({
      where: { platform: 'shipstation' }
    })

    if (!isEnvConfigured && !connection) {
      return NextResponse.json({
        connected: false,
        configured: false,
        message: 'ShipStation API credentials not configured',
        carriers: [],
      })
    }

    // If env configured, test connection
    if (isEnvConfigured) {
      try {
        const carriers = await shipstation.getCarriers()
        return NextResponse.json({
          connected: true,
          configured: true,
          message: 'Connected to ShipStation',
          carriers: carriers.map(c => ({
            name: c.name,
            code: c.code,
            balance: c.balance,
          })),
        })
      } catch (error: any) {
        return NextResponse.json({
          connected: false,
          configured: true,
          message: `Connection failed: ${error.message}`,
          carriers: [],
        })
      }
    }

    // Return database connection status
    return NextResponse.json({
      connected: connection?.isConnected || false,
      configured: true,
      lastSyncAt: connection?.lastSyncAt,
      lastSyncStatus: connection?.lastSyncStatus,
      carriers: [],
    })
  } catch (error) {
    console.error('[ShipStation Settings] Error:', error)
    return NextResponse.json(
      { error: 'Unable to check ShipStation status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/shipstation
 * Test and save ShipStation API credentials
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, apiSecret } = body

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'API Key and API Secret are required' },
        { status: 400 }
      )
    }

    // Test the credentials with ShipStation API
    const authString = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    let verified = false
    let verifyError = ''
    let carriers: any[] = []

    try {
      // Use /carriers endpoint to test connection (this is a valid ShipStation endpoint)
      const testRes = await fetch('https://ssapi.shipstation.com/carriers', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
      })

      if (testRes.ok) {
        verified = true
        const carriersData = await testRes.json()
        // Handle both array and object responses
        carriers = Array.isArray(carriersData) ? carriersData : (carriersData.carriers || [])
      } else {
        const errorText = await testRes.text()
        verifyError = `ShipStation returned ${testRes.status}: ${errorText}`
      }
    } catch (fetchError: any) {
      verifyError = fetchError.message || 'Network error connecting to ShipStation'
    }

    // Save credentials to database
    const existing = await prisma.apiConnection.findFirst({
      where: { platform: 'shipstation' }
    })

    const credentialsJson = JSON.stringify({
      apiKey,
      apiSecret,
    })

    if (existing) {
      await prisma.apiConnection.update({
        where: { id: existing.id },
        data: {
          credentials: credentialsJson,
          isConnected: verified,
          lastSyncStatus: verified ? 'success' : 'error',
          lastSyncError: verifyError || null,
        },
      })
    } else {
      await prisma.apiConnection.create({
        data: {
          platform: 'shipstation',
          credentials: credentialsJson,
          isConnected: verified,
          lastSyncStatus: verified ? 'success' : 'error',
          lastSyncError: verifyError || null,
        },
      })
    }

    if (verified) {
      return NextResponse.json({
        success: true,
        connected: true,
        isConnected: true,
        message: 'ShipStation connected successfully!',
        carriers: carriers.map((c: any) => ({
          name: c.name,
          code: c.code,
          balance: c.balance,
        })),
        instructions: 'Add these environment variables to your deployment:\n' +
          `SHIPSTATION_API_KEY=${apiKey}\n` +
          `SHIPSTATION_API_SECRET=${apiSecret}`
      })
    } else {
      return NextResponse.json({
        success: false,
        connected: false,
        isConnected: false,
        warning: true,
        message: `Credentials saved but verification failed: ${verifyError}`,
      })
    }
  } catch (error: any) {
    console.error('[ShipStation Settings] Error:', error)
    return NextResponse.json(
      { error: `Failed to save settings: ${error.message}` },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/settings/shipstation
 * Remove ShipStation API credentials
 */
export async function DELETE() {
  try {
    await prisma.apiConnection.deleteMany({
      where: { platform: 'shipstation' }
    })

    return NextResponse.json({
      success: true,
      message: 'ShipStation credentials removed',
    })
  } catch (error) {
    console.error('Error deleting shipstation settings:', error)
    return NextResponse.json(
      { error: 'Failed to delete settings' },
      { status: 500 }
    )
  }
}
