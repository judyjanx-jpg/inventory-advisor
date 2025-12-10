/**
 * Script to manually generate AI insights
 * 
 * This script calls the API endpoint to generate insights.
 * Make sure your dev server is running (npm run dev)
 * 
 * Run with: npm run generate-insights
 * 
 * Alternative: Call the API directly:
 *   curl -X POST http://localhost:3000/api/ai/insights/generate
 */

const API_URL = process.env.API_URL || 'http://localhost:3000'

async function main() {
  console.log('Generating AI insights via API...')
  console.log(`Calling: ${API_URL}/api/ai/insights/generate\n`)
  
  try {
    // Use native fetch (Node 18+) or require node-fetch for older versions
    let fetchFn = globalThis.fetch
    
    // If native fetch not available, try to use node-fetch
    if (!fetchFn) {
      try {
        fetchFn = require('node-fetch')
      } catch (e) {
        console.error('❌ Error: fetch is not available. Please use Node.js 18+ or install node-fetch')
        process.exit(1)
      }
    }

    const response = await fetchFn(`${API_URL}/api/ai/insights/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate insights')
    }

    console.log(`✅ ${data.message || 'Successfully generated insights'}`)
    if (data.count !== undefined) {
      console.log(`   Generated ${data.count} observation(s)`)
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      console.error('❌ Error: Could not connect to the API server.')
      console.error('   Make sure your dev server is running: npm run dev')
    } else {
      console.error('❌ Error generating insights:', error.message || error)
    }
    process.exit(1)
  }
}

main()

