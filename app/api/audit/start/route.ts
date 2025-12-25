import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { warehouseId, auditMode, sortOrder, skusToAudit } = body

    if (!warehouseId || !auditMode || !sortOrder) {
      return NextResponse.json(
        { error: 'warehouseId, auditMode, and sortOrder are required' },
        { status: 400 }
      )
    }

    // Check if warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(warehouseId) },
    })

    if (!warehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }

    let skus: string[]
    
    // If specific SKUs provided (e.g., from pending audit), use those
    if (skusToAudit && Array.isArray(skusToAudit) && skusToAudit.length > 0) {
      skus = skusToAudit
    } else {
      // Get all SKUs for this warehouse
      const warehouseInventory = await prisma.warehouseInventory.findMany({
        where: { warehouseId: parseInt(warehouseId) },
        select: { masterSku: true },
      })
      skus = warehouseInventory.map((inv: { masterSku: string }) => inv.masterSku)
    }

    let totalSkus = skus.length
    if (auditMode === 'parent') {
      // Get unique parent SKUs
      const products = await prisma.product.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, parentSku: true },
      })
      const parentSkus = new Set(
        products.map((p: { sku: string; parentSku: string | null }) => p.parentSku || p.sku)
      )
      totalSkus = parentSkus.size
    }

    // Create audit session with optional filter
    const session = await prisma.auditSession.create({
      data: {
        warehouseId: parseInt(warehouseId),
        auditMode,
        sortOrder: skusToAudit ? 'custom' : sortOrder, // Use custom if specific SKUs
        totalSkus,
        status: 'in_progress',
      },
      include: {
        warehouse: true,
      },
    })

    // If specific SKUs provided, store them in custom order for this session
    if (skusToAudit && skusToAudit.length > 0) {
      // Store the SKUs to audit in the session context (via custom order)
      await prisma.$transaction(
        skus.map((sku, index) =>
          prisma.auditCustomOrder.upsert({
            where: {
              warehouseId_sku: {
                warehouseId: parseInt(warehouseId),
                sku,
              },
            },
            update: {
              sortPosition: index,
            },
            create: {
              warehouseId: parseInt(warehouseId),
              sku,
              sortPosition: index,
            },
          })
        )
      )
    }

    return NextResponse.json({ ...session, skusToAudit: skusToAudit || null })
  } catch (error: any) {
    console.error('Error starting audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to start audit session' },
      { status: 500 }
    )
  }
}

