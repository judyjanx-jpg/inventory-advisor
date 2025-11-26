import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MARKETPLACES } from '@/lib/amazon-sp-api'

export async function GET() {
  try {
    const connection = await prisma.apiConnection.findUnique({
      where: { platform: 'amazon' },
    })

    if (!connection) {
      return NextResponse.json({
        isConnected: false,
        credentials: null,
      })
    }

    // Parse credentials but hide sensitive data
    let safeCredentials = null
    if (connection.credentials) {
      try {
        const creds = JSON.parse(connection.credentials)
        safeCredentials = {
          sellerId: creds.sellerId || '',
          marketplaceId: creds.marketplaceId || MARKETPLACES.US,
          clientId: creds.clientId ? '••••••••' + creds.clientId.slice(-8) : '',
          clientSecret: creds.clientSecret ? '••••••••' : '',
          refreshToken: creds.refreshToken ? creds.refreshToken.slice(0, 20) + '...' : '',
          region: creds.region || 'na',
        }
      } catch {
        safeCredentials = null
      }
    }

    return NextResponse.json({
      isConnected: connection.isConnected,
      credentials: safeCredentials,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
      lastSyncError: connection.lastSyncError,
      lastSuccessfulSync: connection.lastSuccessfulSync,
    })
  } catch (error: any) {
    console.error('Error fetching Amazon settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      sellerId,
      marketplaceId,
      clientId,
      clientSecret,
      refreshToken,
      region,
    } = body

    // Validate required fields
    if (!sellerId || !clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing required credentials' },
        { status: 400 }
      )
    }

    const credentials = JSON.stringify({
      sellerId,
      marketplaceId: marketplaceId || MARKETPLACES.US,
      clientId,
      clientSecret,
      refreshToken,
      region: region || 'na',
    })

    // Upsert the connection
    const connection = await prisma.apiConnection.upsert({
      where: { platform: 'amazon' },
      update: {
        credentials,
        isConnected: true,
        updatedAt: new Date(),
      },
      create: {
        platform: 'amazon',
        credentials,
        isConnected: true,
      },
    })

    return NextResponse.json({
      success: true,
      isConnected: connection.isConnected,
    })
  } catch (error: any) {
    console.error('Error saving Amazon settings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    await prisma.apiConnection.delete({
      where: { platform: 'amazon' },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error disconnecting Amazon:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect' },
      { status: 500 }
    )
  }
}

