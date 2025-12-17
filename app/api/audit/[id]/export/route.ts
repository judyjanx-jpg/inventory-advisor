import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await prisma.auditSession.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        entries: {
          orderBy: { sku: 'asc' },
        },
        warehouse: true,
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    // Format date for filename
    const dateStr = session.completedAt 
      ? new Date(session.completedAt).toISOString().split('T')[0]
      : new Date(session.startedAt).toISOString().split('T')[0]

    // Prepare summary data
    const totalVariance = session.entries.reduce((sum, e) => sum + e.variance, 0)
    const positiveVariance = session.entries.filter(e => e.variance > 0).reduce((sum, e) => sum + e.variance, 0)
    const negativeVariance = session.entries.filter(e => e.variance < 0).reduce((sum, e) => sum + Math.abs(e.variance), 0)
    const flaggedCount = session.entries.filter(e => e.isFlagged).length

    // Create workbook
    const wb = XLSX.utils.book_new()

    // Summary sheet
    const summaryData = [
      ['Audit Report'],
      [''],
      ['Warehouse', session.warehouse.name],
      ['Audit Mode', session.auditMode === 'parent' ? 'Parent Listing' : 'Single SKU'],
      ['Started', new Date(session.startedAt).toLocaleString()],
      ['Completed', session.completedAt ? new Date(session.completedAt).toLocaleString() : 'In Progress'],
      ['Status', session.status],
      [''],
      ['Summary'],
      ['Total SKUs in Warehouse', session.totalSkus],
      ['SKUs Audited', session.auditedCount],
      ['Completion %', `${Math.round((session.auditedCount / session.totalSkus) * 100)}%`],
      [''],
      ['Variance Summary'],
      ['Net Variance', totalVariance],
      ['Positive Adjustments', `+${positiveVariance}`],
      ['Negative Adjustments', `-${negativeVariance}`],
      ['Flagged Discrepancies', flaggedCount],
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    
    // Style the summary sheet
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

    // Detailed entries sheet
    const entriesData = [
      ['SKU', 'Parent SKU', 'Previous Qty', 'New Qty', 'Variance', 'Flagged', 'Notes', 'Audited At'],
      ...session.entries.map(e => [
        e.sku,
        e.parentSku || '',
        e.previousQty,
        e.newQty,
        e.variance,
        e.isFlagged ? 'Yes' : 'No',
        e.notes || '',
        e.auditedAt ? new Date(e.auditedAt).toLocaleString() : '',
      ])
    ]
    const entriesSheet = XLSX.utils.aoa_to_sheet(entriesData)
    entriesSheet['!cols'] = [
      { wch: 20 }, // SKU
      { wch: 20 }, // Parent SKU
      { wch: 12 }, // Previous Qty
      { wch: 10 }, // New Qty
      { wch: 10 }, // Variance
      { wch: 8 },  // Flagged
      { wch: 40 }, // Notes
      { wch: 20 }, // Audited At
    ]
    XLSX.utils.book_append_sheet(wb, entriesSheet, 'Audit Entries')

    // Flagged items sheet (if any)
    const flaggedEntries = session.entries.filter(e => e.isFlagged)
    if (flaggedEntries.length > 0) {
      const flaggedData = [
        ['SKU', 'Parent SKU', 'Previous Qty', 'New Qty', 'Variance', 'Notes'],
        ...flaggedEntries.map(e => [
          e.sku,
          e.parentSku || '',
          e.previousQty,
          e.newQty,
          e.variance,
          e.notes || '',
        ])
      ]
      const flaggedSheet = XLSX.utils.aoa_to_sheet(flaggedData)
      flaggedSheet['!cols'] = [
        { wch: 20 },
        { wch: 20 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 40 },
      ]
      XLSX.utils.book_append_sheet(wb, flaggedSheet, 'Flagged Items')
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Return as downloadable file
    const filename = `audit-${session.warehouse.name.replace(/\s+/g, '-')}-${dateStr}.xlsx`
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error('Error exporting audit:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export audit' },
      { status: 500 }
    )
  }
}

