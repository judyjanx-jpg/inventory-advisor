import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/settings/transparency
 * Get Transparency API settings (without secret)
 */
export async function GET() {
  try {
    const connection = await prisma.apiConnection.findFirst({
      where: { name: 'transparency' }
    })

    if (!connection) {
      return NextResponse.json({
        configured: false,
        clientId: null,
      })
    }

    const creds = connection.credentials as any

    return NextResponse.json({
      configured: true,
      clientId: creds?.clientId || null,
      hasSecret: !!creds?.clientSecret,
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
    })
  } catch (error) {
    console.error('Error fetching transparency settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/transparency
 * Save Transparency API credentials
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { clientId, clientSecret } = body

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Client ID and Client Secret are required' },
        { status: 400 }
      )
    }

    // Test the credentials by trying to get an access token
    try {
      const response = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'transparency:codes:read transparency:codes:request',
        }).toString(),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('Transparency auth test failed:', error)
        return NextResponse.json(
          { error: 'Invalid credentials - authentication failed' },
          { status: 400 }
        )
      }
    } catch (authError) {
      console.error('Transparency auth test error:', authError)
      return NextResponse.json(
        { error: 'Could not verify credentials' },
        { status: 400 }
      )
    }

    // Save or update credentials
    const existing = await prisma.apiConnection.findFirst({
      where: { name: 'transparency' }
    })

    if (existing) {
      await prisma.apiConnection.update({
        where: { id: existing.id },
        data: {
          credentials: {
            clientId,
            clientSecret,
          },
          status: 'active',
          updatedAt: new Date(),
        },
      })
    } else {
      await prisma.apiConnection.create({
        data: {
          name: 'transparency',
          type: 'transparency',
          status: 'active',
          credentials: {
            clientId,
            clientSecret,
          },
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Transparency API credentials saved and verified',
    })
  } catch (error) {
    console.error('Error saving transparency settings:', error)
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/settings/transparency
 * Remove Transparency API credentials
 */
export async function DELETE() {
  try {
    await prisma.apiConnection.deleteMany({
      where: { name: 'transparency' }
    })

    return NextResponse.json({
      success: true,
      message: 'Transparency API credentials removed',
    })
  } catch (error) {
    console.error('Error deleting transparency settings:', error)
    return NextResponse.json(
      { error: 'Failed to delete settings' },
      { status: 500 }
    )
  }
}

