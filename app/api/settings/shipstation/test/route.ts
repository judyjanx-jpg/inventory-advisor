import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/settings/shipstation/test
 * Test ShipStation API connection
 */
export async function POST() {
  try {
    const connection = await prisma.apiConnection.findFirst({
      where: { platform: 'shipstation' }
    })

    if (!connection || !connection.credentials) {
      return NextResponse.json(
        { success: false, error: 'ShipStation not configured' },
        { status: 400 }
      )
    }

    const creds = JSON.parse(connection.credentials)
    const { apiKey, apiSecret } = creds

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, error: 'Missing API credentials' },
        { status: 400 }
      )
    }

    const authString = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

    // Use /carriers endpoint to test connection (valid endpoint)
    const res = await fetch('https://ssapi.shipstation.com/carriers', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    })

    if (res.ok) {
      const carriers = await res.json()

      // Update connection status
      await prisma.apiConnection.update({
        where: { id: connection.id },
        data: {
          isConnected: true,
          lastSyncStatus: 'success',
          lastSyncError: null,
        },
      })

      return NextResponse.json({
        success: true,
        accountName: 'ShipStation Account',
        carriers: Array.isArray(carriers) ? carriers.length : 0,
        message: 'Connection verified successfully',
      })
    } else {
      const errorText = await res.text()

      // Update connection status
      await prisma.apiConnection.update({
        where: { id: connection.id },
        data: {
          isConnected: false,
          lastSyncStatus: 'error',
          lastSyncError: `API returned ${res.status}`,
        },
      })

      return NextResponse.json({
        success: false,
        error: `ShipStation API returned ${res.status}: ${errorText}`,
      })
    }
  } catch (error: any) {
    console.error('Error testing ShipStation connection:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
