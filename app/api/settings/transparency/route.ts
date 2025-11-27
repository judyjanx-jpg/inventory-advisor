import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testTransparencyCredentials } from '@/lib/transparency-api'

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
    const { clientId, clientSecret, skipVerify } = body

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Client ID and Client Secret are required' },
        { status: 400 }
      )
    }

    let verificationResult = { success: true, error: undefined as string | undefined }

    // Test the credentials using Amazon Cognito endpoint
    if (!skipVerify) {
      verificationResult = await testTransparencyCredentials(clientId, clientSecret)
      
      if (!verificationResult.success) {
        console.error('Transparency auth test failed:', verificationResult.error)
        // Still save but mark as pending verification
      }
    }

    // Save or update credentials
    const existing = await prisma.apiConnection.findFirst({
      where: { name: 'transparency' }
    })

    const status = verificationResult.success ? 'active' : 'pending'

    if (existing) {
      await prisma.apiConnection.update({
        where: { id: existing.id },
        data: {
          credentials: {
            clientId,
            clientSecret,
          },
          status,
          updatedAt: new Date(),
        },
      })
    } else {
      await prisma.apiConnection.create({
        data: {
          name: 'transparency',
          type: 'transparency',
          status,
          credentials: {
            clientId,
            clientSecret,
          },
        },
      })
    }

    if (verificationResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Transparency API credentials saved and verified',
      })
    } else {
      return NextResponse.json({
        success: true,
        warning: true,
        message: `Credentials saved but verification failed: ${verificationResult.error}. You may still be able to use the API.`,
      })
    }
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

