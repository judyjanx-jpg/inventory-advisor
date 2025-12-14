import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/settings/shipstation
 * Get ShipStation API settings (without secret)
 */
export async function GET() {
  try {
    const connection = await prisma.apiConnection.findFirst({
      where: { platform: 'shipstation' }
    })

    if (!connection) {
      return NextResponse.json({
        isConnected: false,
        configured: false,
      })
    }

    return NextResponse.json({
      isConnected: connection.isConnected,
      configured: true,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
    })
  } catch (error) {
    console.error('Error fetching shipstation settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/shipstation
 * Save ShipStation API credentials
 */
export async function POST(request: Request) {
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

    try {
      const testRes = await fetch('https://ssapi.shipstation.com/accounts', {
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
      })

      if (testRes.ok) {
        verified = true
      } else {
        const errorText = await testRes.text()
        verifyError = `ShipStation returned ${testRes.status}: ${errorText}`
      }
    } catch (fetchError: any) {
      verifyError = fetchError.message
    }

    // Save credentials
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
        message: 'ShipStation connected successfully',
      })
    } else {
      return NextResponse.json({
        success: true,
        warning: true,
        message: `Credentials saved but verification failed: ${verifyError}`,
      })
    }
  } catch (error: any) {
    console.error('Error saving shipstation settings:', error)
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
