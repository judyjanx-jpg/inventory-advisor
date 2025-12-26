// app/api/pricing/update/route.ts
// API for updating product prices (single or bulk)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Round up to nearest .99 or .49
function roundToNinetyNine(price: number): number {
  const base = Math.floor(price)
  const decimal = price - base
  
  if (decimal <= 0.49) {
    return base + 0.49
  } else {
    return base + 0.99
  }
}

// Calculate multi-step schedule if needed
function calculateSchedule(currentPrice: number, targetPrice: number, maxRaisePercent: number): number[] {
  if (targetPrice <= currentPrice) {
    // No increase needed or price decrease - single step
    return [targetPrice]
  }
  
  const maxRaise = 1 + (maxRaisePercent / 100)
  const steps: number[] = []
  let price = currentPrice
  
  while (price < targetPrice) {
    const nextPrice = price * maxRaise
    if (nextPrice >= targetPrice) {
      steps.push(roundToNinetyNine(targetPrice))
      break
    } else {
      steps.push(roundToNinetyNine(nextPrice))
      price = nextPrice
    }
    
    // Safety limit
    if (steps.length > 20) break
  }
  
  return steps
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { updates } = body // Array of { sku, newPrice, createSchedule? }
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const results: { sku: string; success: boolean; error?: string }[] = []
    const successful: string[] = []
    const failed: { sku: string; error: string }[] = []

    // Get global settings for schedule calculation
    const settings = await prisma.pricingSettings.findFirst()
    const maxRaisePercent = Number(settings?.maxRaisePercent || 8)

    for (const update of updates) {
      try {
        const { sku, newPrice, createSchedule } = update
        
        // Get current product
        const product = await prisma.product.findUnique({
          where: { sku }
        })
        
        if (!product) {
          failed.push({ sku, error: 'Product not found' })
          continue
        }

        const oldPrice = Number(product.price)
        const roundedNewPrice = roundToNinetyNine(newPrice)

        // Check if we need to create a multi-step schedule
        const priceIncrease = ((roundedNewPrice - oldPrice) / oldPrice) * 100
        
        if (createSchedule && priceIncrease > maxRaisePercent) {
          // Create multi-step schedule
          const steps = calculateSchedule(oldPrice, roundedNewPrice, maxRaisePercent)
          
          // Clear existing schedule for this SKU
          await prisma.priceSchedule.deleteMany({
            where: { sku, status: 'pending' }
          })
          
          // Create new schedule entries
          const today = new Date()
          for (let i = 0; i < steps.length; i++) {
            const scheduledDate = new Date(today)
            scheduledDate.setDate(scheduledDate.getDate() + (i * 7)) // Weekly steps
            
            await prisma.priceSchedule.create({
              data: {
                sku,
                stepNumber: i + 1,
                targetPrice: steps[i],
                scheduledFor: scheduledDate,
                status: i === 0 ? 'pending' : 'pending'
              }
            })
          }

          // Apply first step immediately
          await prisma.product.update({
            where: { sku },
            data: { price: steps[0] }
          })

          // Log price history
          await prisma.priceHistory.create({
            data: {
              sku,
              oldPrice,
              newPrice: steps[0],
              triggeredBy: 'scheduled'
            }
          })

          // Mark first step as applied
          await prisma.priceSchedule.updateMany({
            where: { sku, stepNumber: 1 },
            data: { status: 'applied', appliedAt: new Date() }
          })

          successful.push(sku)
        } else {
          // Single price update
          await prisma.product.update({
            where: { sku },
            data: { price: roundedNewPrice }
          })

          // Log price history
          await prisma.priceHistory.create({
            data: {
              sku,
              oldPrice,
              newPrice: roundedNewPrice,
              triggeredBy: 'manual'
            }
          })

          // Clear any pending schedules
          await prisma.priceSchedule.deleteMany({
            where: { sku, status: 'pending' }
          })

          successful.push(sku)
        }

        results.push({ sku, success: true })
      } catch (err: any) {
        failed.push({ sku: update.sku, error: err.message })
        results.push({ sku: update.sku, success: false, error: err.message })
      }
    }

    return NextResponse.json({
      success: true,
      total: updates.length,
      successful: successful.length,
      failed: failed.length,
      failedItems: failed,
      results
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Apply next scheduled step for a SKU
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { sku } = body

    // Get next pending step
    const nextStep = await prisma.priceSchedule.findFirst({
      where: { sku, status: 'pending' },
      orderBy: { stepNumber: 'asc' }
    })

    if (!nextStep) {
      return NextResponse.json({ error: 'No pending schedule found' }, { status: 404 })
    }

    // Get current price
    const product = await prisma.product.findUnique({ where: { sku } })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const oldPrice = Number(product.price)
    const newPrice = Number(nextStep.targetPrice)

    // Update price
    await prisma.product.update({
      where: { sku },
      data: { price: newPrice }
    })

    // Log price history
    await prisma.priceHistory.create({
      data: {
        sku,
        oldPrice,
        newPrice,
        triggeredBy: 'scheduled'
      }
    })

    // Mark step as applied
    await prisma.priceSchedule.update({
      where: { id: nextStep.id },
      data: { status: 'applied', appliedAt: new Date() }
    })

    return NextResponse.json({
      success: true,
      appliedStep: nextStep.stepNumber,
      newPrice
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

