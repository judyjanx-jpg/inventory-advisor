// app/api/amazon/test-report-direct/route.ts
// Bypass amazon-sp-api library - call Amazon directly

import { NextResponse } from 'next/server'
import { getAmazonCredentials } from '@/lib/amazon-sp-api'

export async function GET() {
  const log: string[] = []
  const addLog = (msg: string) => {
    console.log(msg)
    log.push(msg)
  }

  try {
    addLog('1. Getting credentials...')
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'No credentials', log })
    }
    addLog(`   ✓ Got credentials`)

    // Step 1: Get access token directly from Amazon
    addLog('2. Getting access token from Amazon LWA...')
    const tokenStartTime = Date.now()
    
    const tokenResponse = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    const tokenElapsed = Date.now() - tokenStartTime
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      addLog(`   ❌ Token request failed: ${tokenResponse.status} - ${errorText}`)
      return NextResponse.json({ error: 'Token request failed', details: errorText, log })
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    addLog(`   ✓ Got access token in ${tokenElapsed}ms`)

    // Step 2: Call createReport directly
    addLog('3. Calling createReport API directly...')
    
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)

    const reportBody = {
      reportType: 'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
      marketplaceIds: [credentials.marketplaceId],
      dataStartTime: startDate.toISOString(),
      dataEndTime: endDate.toISOString(),
    }

    addLog(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    addLog(`   Request body: ${JSON.stringify(reportBody)}`)

    const apiStartTime = Date.now()

    const reportResponse = await fetch('https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
        'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
      },
      body: JSON.stringify(reportBody),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    })

    const apiElapsed = Date.now() - apiStartTime
    addLog(`   Response status: ${reportResponse.status} in ${apiElapsed}ms`)

    const responseText = await reportResponse.text()
    addLog(`   Response body: ${responseText.substring(0, 500)}`)

    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    if (!reportResponse.ok) {
      return NextResponse.json({
        success: false,
        status: reportResponse.status,
        error: responseData,
        log,
      })
    }

    return NextResponse.json({
      success: true,
      tokenTime: `${tokenElapsed}ms`,
      apiTime: `${apiElapsed}ms`,
      reportId: responseData?.reportId,
      response: responseData,
      log,
    })

  } catch (error: any) {
    addLog(`❌ Error: ${error.message}`)
    
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      addLog('   This was a TIMEOUT - Amazon did not respond in time')
    }
    
    return NextResponse.json({
      success: false,
      error: error.message,
      errorType: error.name,
      log,
    }, { status: 500 })
  }
}
