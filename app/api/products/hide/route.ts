import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { sku, hidden } = await request.json()

    if (!sku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 })
    }

    const product = await prisma.product.update({
      where: { sku },
      data: { isHidden: hidden ?? true },
      select: { sku: true, isHidden: true }
    })

    return NextResponse.json({ success: true, product })
  } catch (error: any) {
    console.error('Error hiding product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to hide product' },
      { status: 500 }
    )
  }
}
