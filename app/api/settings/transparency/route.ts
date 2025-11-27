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
      where: { platform: 'transparency' }
    })

    if (!connection) {
      return NextResponse.json({
        configured: false,
        clientId: null,
      })
    }

    const creds = connection.credentials ? JSON.parse(connection.credentials) : null

    return NextResponse.json({
      configured: true,
      clientId: creds?.clientId || null,
      hasSecret: !!creds?.clientSecret,
      isConnected: connection.isConnected,
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
    const { clientId, clientSecret, awsAccessKeyId, awsSecretAccessKey, awsRegion, skipVerify } = body

    console.log('Saving Transparency credentials, skipVerify:', skipVerify)

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Client ID and Client Secret are required' },
        { status: 400 }
      )
    }

    let verificationResult = { success: true, error: undefined as string | undefined }

    // Test the credentials using Amazon Cognito endpoint (only if not skipping)
    if (!skipVerify) {
      try {
        verificationResult = await testTransparencyCredentials(clientId, clientSecret)
        if (!verificationResult.success) {
          console.log('Transparency auth test failed:', verificationResult.error)
        }
      } catch (verifyError: any) {
        console.error('Transparency verification error:', verifyError)
        verificationResult = { success: false, error: verifyError.message }
      }
    }

    // Save or update credentials regardless of verification result
    try {
      const existing = await prisma.apiConnection.findFirst({
        where: { platform: 'transparency' }
      })

      const credentialsJson = JSON.stringify({
        clientId,
        clientSecret,
        ...(awsAccessKeyId && awsSecretAccessKey ? {
          awsAccessKeyId,
          awsSecretAccessKey,
          awsRegion: awsRegion || 'us-east-1',
        } : {}),
      })

      if (existing) {
        await prisma.apiConnection.update({
          where: { id: existing.id },
          data: {
            credentials: credentialsJson,
            isConnected: verificationResult.success,
            lastSyncStatus: verificationResult.success ? 'success' : 'error',
            lastSyncError: verificationResult.error || null,
          },
        })
        console.log('Updated existing Transparency credentials')
      } else {
        await prisma.apiConnection.create({
          data: {
            platform: 'transparency',
            credentials: credentialsJson,
            isConnected: verificationResult.success,
            lastSyncStatus: verificationResult.success ? 'success' : 'error',
            lastSyncError: verificationResult.error || null,
          },
        })
        console.log('Created new Transparency credentials')
      }
    } catch (dbError: any) {
      console.error('Database error saving credentials:', dbError)
      return NextResponse.json(
        { error: `Failed to save to database: ${dbError.message}` },
        { status: 500 }
      )
    }

    if (verificationResult.success || skipVerify) {
      return NextResponse.json({
        success: true,
        message: skipVerify 
          ? 'Transparency API credentials saved (verification skipped)'
          : 'Transparency API credentials saved and verified',
      })
    } else {
      return NextResponse.json({
        success: true,
        warning: true,
        message: `Credentials saved but verification failed: ${verificationResult.error}. You may still be able to use the API.`,
      })
    }
  } catch (error: any) {
    console.error('Error saving transparency settings:', error)
    return NextResponse.json(
      { error: `Failed to save settings: ${error.message}` },
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
      where: { platform: 'transparency' }
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

