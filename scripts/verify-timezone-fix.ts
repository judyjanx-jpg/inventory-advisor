// scripts/verify-timezone-fix.ts
// Verify the timezone conversion fix

import { prisma } from '../lib/prisma'

async function verifyTimezoneFix() {
  try {
    console.log('='.repeat(80))
    console.log('TIMEZONE CONVERSION VERIFICATION')
    console.log('='.repeat(80))
    
    const results = await prisma.$queryRaw<Array<{
      stored_utc: Date
      correct_pst: Date
    }>>`
      SELECT 
        o.purchase_date as stored_utc,
        (o.purchase_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles' as correct_pst
      FROM orders o
      WHERE o.id = '111-6536129-2354650'
    `
    
    if (results.length === 0) {
      console.log('Order not found')
    } else {
      const row = results[0]
      const storedUTC = new Date(row.stored_utc).toISOString()
      const correctPST = new Date(row.correct_pst).toISOString()
      
      console.log(`\nStored UTC:  ${storedUTC}`)
      console.log(`Correct PST:  ${correctPST}`)
      
      // Dec 8 16:28 UTC should become Dec 8 08:28 PST (8 hours earlier)
      const utcDate = new Date(row.stored_utc)
      const pstDate = new Date(row.correct_pst)
      
      console.log(`\nExpected: Dec 8 16:28 UTC → Dec 8 08:28 PST`)
      console.log(`Actual:   ${utcDate.toISOString().substring(0, 16)} UTC → ${pstDate.toISOString().substring(0, 16)} PST`)
      
      const hoursDiff = (pstDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60)
      console.log(`\nTime difference: ${hoursDiff} hours (should be -8 for PST)`)
      
      if (Math.abs(hoursDiff + 8) < 0.1) {
        console.log('✅ Timezone conversion is CORRECT')
      } else {
        console.log('❌ Timezone conversion is WRONG')
      }
    }
    
    console.log('\n' + '='.repeat(80))
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

verifyTimezoneFix()

