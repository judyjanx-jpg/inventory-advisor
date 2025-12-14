import { NextRequest, NextResponse } from 'next/server'
import { shipstation } from '@/lib/shipstation'

// GET - Check ShipStation connection status
export async function GET() {
  try {
    const isConfigured = shipstation.isConfigured()
    
    if (!isConfigured) {
      return NextResponse.json({
        connected: false,
        message: 'ShipStation API credentials not configured',
        carriers: [],
      })
    }

    // Try to fetch carriers to verify connection
    try {
      const carriers = await shipstation.getCarriers()
      return NextResponse.json({
        connected: true,
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
        message: `Connection failed: ${error.message}`,
        carriers: [],
      })
    }
  } catch (error) {
    console.error('[ShipStation Settings] Error:', error)
    return NextResponse.json(
      { error: 'Unable to check ShipStation status' },
      { status: 500 }
    )
  }
}

// POST - Test ShipStation connection with provided credentials
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, apiSecret } = body

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'API Key and Secret are required' },
        { status: 400 }
      )
    }

    // Test connection with provided credentials
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    const response = await fetch('https://ssapi.shipstation.com/carriers', {
      headers: {
        'Authorization': `Basic ${auth}`,
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        success: false,
        message: `Authentication failed: ${response.status}`,
        error: errorText,
      })
    }

    const carriers = await response.json()
    
    return NextResponse.json({
      success: true,
      message: 'Connection successful!',
      carriers: carriers.map((c: any) => ({
        name: c.name,
        code: c.code,
        balance: c.balance,
      })),
      instructions: 'Add these environment variables to your deployment:\n' +
        `SHIPSTATION_API_KEY=${apiKey}\n` +
        `SHIPSTATION_API_SECRET=${apiSecret}`
    })
  } catch (error: any) {
    console.error('[ShipStation Settings] Test error:', error)
    return NextResponse.json({
      success: false,
      message: error.message || 'Connection test failed',
    })
  }
}

