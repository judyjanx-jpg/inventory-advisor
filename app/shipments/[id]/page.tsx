'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ShipmentSummaryBar, { ShipmentStage } from '@/components/shipments/ShipmentSummaryBar'
import BoxCreation from '@/components/shipments/BoxCreation'
import { 
  Package, 
  Plus, 
  Trash2, 
  Save, 
  Printer, 
  Truck, 
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'

interface ShipmentItem {
  id: number
  masterSku: string
  fnsku: string | null
  productName: string
  requestedQty: number
  adjustedQty: number
  pickStatus: string
  pickedAt: string | null
}

interface Box {
  id: number
  boxNumber: number
  items: { sku: string; quantity: number }[]
  lengthInches?: number
  widthInches?: number
  heightInches?: number
  weightLbs?: number
}

interface Shipment {
  id: number
  internalId: string
  status: string
  fromLocationId: number | null
  toLocationId: number | null
  fromLocation?: { name: string; code: string } | null
  toLocation?: { name: string; code: string } | null
  optimalPlacementEnabled: boolean
  amazonShipmentId: string | null
  destinationFc: string | null
  carrier: string | null
  trackingNumber: string | null
  createdAt: string
  submittedAt: string | null
  shippedAt: string | null
  items: ShipmentItem[]
  boxes: Box[]
}

export default function ShipmentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const shipmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [expandedSections, setExpandedSections] = useState({
    items: true,
    picking: true,
    boxes: true,
  })

  // Section refs for scroll navigation
  const itemsRef = useRef<HTMLDivElement>(null)
  const pickingRef = useRef<HTMLDivElement>(null)
  const boxesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchShipment()
  }, [shipmentId])

  const fetchShipment = async () => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`)
      const data = await res.json()
      if (res.ok) {
        // API returns { shipment: ... } wrapper
        const shipmentData = data.shipment || data
        // Transform to expected format
        const transformed = {
          ...shipmentData,
          items: shipmentData.items.map((item: any) => ({
            id: item.id,
            masterSku: item.masterSku,
            fnsku: item.fnsku || item.product?.fnsku,
            productName: item.productName || item.product?.title,
            requestedQty: item.requestedQty,
            adjustedQty: item.adjustedQty,
            pickStatus: item.pickStatus || 'pending',
            pickedAt: item.pickedAt,
          })),
          boxes: (shipmentData.boxes || []).map((box: any) => ({
            id: box.id,
            boxNumber: box.boxNumber,
            items: (box.items || []).map((item: any) => ({
              sku: item.masterSku,
              quantity: item.quantity,
            })),
            lengthInches: box.lengthInches,
            widthInches: box.widthInches,
            heightInches: box.heightInches,
            weightLbs: box.weightLbs,
          })),
        }
        setShipment(transformed)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error fetching shipment:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveShipment = async () => {
    if (!shipment) return
    setSaving(true)
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxes: shipment.boxes,
          items: shipment.items.map(item => ({
            id: item.id,
            adjustedQty: item.adjustedQty,
            requestedQty: item.requestedQty,
          })),
        }),
      })
      if (res.ok) {
        await fetchShipment()
        alert('Shipment saved!')
      } else {
        const data = await res.json()
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error saving shipment:', error)
    } finally {
      setSaving(false)
    }
  }

  const markPickingComplete = async () => {
    if (!shipment) return
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: shipment.items.map(item => ({
            id: item.id,
            pickStatus: 'picked',
          })),
        }),
      })
      if (res.ok) {
        await fetchShipment()
      }
    } catch (error) {
      console.error('Error marking picking complete:', error)
    }
  }

  const updateItemQty = (itemId: number, newQty: number) => {
    if (!shipment) return
    setShipment({
      ...shipment,
      items: shipment.items.map(item => 
        item.id === itemId 
          ? { ...item, adjustedQty: newQty, requestedQty: newQty }
          : item
      ),
    })
  }

  const removeItem = (itemId: number) => {
    if (!shipment) return
    if (!confirm('Remove this item from the shipment?')) return
    setShipment({
      ...shipment,
      items: shipment.items.filter(item => item.id !== itemId),
    })
  }

  const markAsShipped = async () => {
    if (!shipment) return
    
    // Validation
    const allItemsAssigned = shipment.items.every(item => {
      const boxTotal = shipment.boxes.reduce((sum, box) => {
        const boxItem = box.items.find(bi => bi.sku === item.masterSku)
        return sum + (boxItem?.quantity || 0)
      }, 0)
      return boxTotal === item.adjustedQty
    })

    if (!allItemsAssigned) {
      alert('Please assign all items to boxes before shipping')
      return
    }

    const allBoxesComplete = shipment.boxes.every(box => 
      box.lengthInches && box.widthInches && box.heightInches && box.weightLbs
    )

    if (!allBoxesComplete) {
      alert('Please complete dimensions and weight for all boxes')
      return
    }

    const trackingNumber = prompt('Enter tracking number (optional):')
    const carrier = prompt('Enter carrier (e.g., UPS, FedEx):')

    if (!confirm('Are you sure you want to mark this shipment as shipped? This will decrement warehouse inventory.')) {
      return
    }

    try {
      const res = await fetch(`/api/shipments/${shipmentId}/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber,
          carrier,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        alert('Shipment marked as shipped! Inventory has been decremented.')
        await fetchShipment()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error marking as shipped:', error)
      alert('Failed to mark as shipped')
    }
  }

  const generatePackingListPDF = async () => {
    if (!shipment) return
    
    // Create a printable packing list
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print the packing list')
      return
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing List - ${shipment.internalId || `SHP-${shipment.id}`}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { font-size: 24px; margin-bottom: 10px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-item { }
          .info-label { font-weight: bold; font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f4f4f4; font-weight: bold; }
          .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
          .signature-line { border-bottom: 1px solid #000; width: 200px; display: inline-block; margin-top: 20px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PACKING LIST</h1>
        </div>
        <div class="info">
          <div class="info-item">
            <div class="info-label">Shipment ID</div>
            <div>${shipment.internalId || `SHP-${shipment.id}`}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Date</div>
            <div>${new Date().toLocaleDateString()}</div>
          </div>
          <div class="info-item">
            <div class="info-label">From</div>
            <div>${shipment.fromLocation?.name || 'Warehouse'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">To</div>
            <div>FBA ${shipment.destinationFc || 'US'}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product Name</th>
              <th>FNSKU</th>
              <th>Quantity</th>
              <th>Picked</th>
            </tr>
          </thead>
          <tbody>
            ${shipment.items.map(item => `
              <tr>
                <td>${item.masterSku}</td>
                <td>${item.productName}</td>
                <td>${item.fnsku || '—'}</td>
                <td>${item.adjustedQty}</td>
                <td>☐</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align: right; font-weight: bold;">TOTAL:</td>
              <td style="font-weight: bold;">${shipment.items.reduce((sum, i) => sum + i.adjustedQty, 0)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div class="footer">
          <div>
            <span>Picked By: </span>
            <span class="signature-line"></span>
            <span style="margin-left: 40px;">Date: </span>
            <span class="signature-line"></span>
          </div>
          <div style="margin-top: 20px;">
            <span>Verified By: </span>
            <span class="signature-line"></span>
            <span style="margin-left: 40px;">Date: </span>
            <span class="signature-line"></span>
          </div>
        </div>
      </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.print()
  }

  const handleStageClick = (stage: ShipmentStage) => {
    switch (stage) {
      case 'create':
      case 'pick':
        pickingRef.current?.scrollIntoView({ behavior: 'smooth' })
        break
      case 'label':
      case 'box':
        boxesRef.current?.scrollIntoView({ behavior: 'smooth' })
        break
    }
  }

  // Calculate current stage and completed stages
  const getStageInfo = () => {
    if (!shipment) return { current: 'create' as ShipmentStage, completed: [] as ShipmentStage[] }

    const hasItems = shipment.items.length > 0
    const allPicked = shipment.items.every(i => i.pickStatus === 'picked')
    const hasBoxes = shipment.boxes.length > 0
    const allItemsAssigned = shipment.items.every(item => {
      const boxTotal = shipment.boxes.reduce((sum, box) => {
        const boxItem = box.items.find(bi => bi.sku === item.masterSku)
        return sum + (boxItem?.quantity || 0)
      }, 0)
      return boxTotal === item.adjustedQty
    })
    const allBoxesComplete = shipment.boxes.every(box => 
      box.lengthInches && box.widthInches && box.heightInches && box.weightLbs
    )
    const isShipped = ['shipped', 'in_transit', 'receiving', 'received'].includes(shipment.status)

    const completed: ShipmentStage[] = []
    if (hasItems) completed.push('create')
    if (allPicked) completed.push('pick')
    if (hasBoxes && allItemsAssigned) {
      completed.push('label')
      if (allBoxesComplete) completed.push('box')
    }
    if (isShipped) completed.push('ship')

    let current: ShipmentStage = 'create'
    if (hasItems && !allPicked) current = 'pick'
    else if (allPicked && (!hasBoxes || !allItemsAssigned)) current = 'box'
    else if (allBoxesComplete && !isShipped) current = 'ship'

    return { current, completed }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
        </div>
      </MainLayout>
    )
  }

  if (!shipment) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-white">Shipment not found</h1>
          <Button className="mt-4" onClick={() => router.push('/fba-shipments')}>
            Back to Shipments
          </Button>
        </div>
      </MainLayout>
    )
  }

  const { current: currentStage, completed: completedStages } = getStageInfo()
  const totalUnits = shipment.items.reduce((sum, i) => sum + i.adjustedQty, 0)
  const isShipped = ['shipped', 'in_transit', 'receiving', 'received'].includes(shipment.status)

  return (
    <MainLayout>
      {/* Sticky Summary Bar */}
      <ShipmentSummaryBar
        totalSkus={shipment.items.length}
        totalUnits={totalUnits}
        totalBoxes={shipment.boxes.length}
        currentStage={currentStage}
        completedStages={completedStages}
        status={shipment.status}
        onStageClick={handleStageClick}
      />

      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {shipment.internalId || `Shipment #${shipment.id}`}
            </h1>
            <div className="flex items-center gap-4 mt-1">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                shipment.status === 'draft' ? 'bg-slate-700 text-slate-300' :
                shipment.status === 'shipped' ? 'bg-emerald-900/50 text-emerald-400' :
                'bg-blue-900/50 text-blue-400'
              }`}>
                {shipment.status.toUpperCase()}
              </span>
              <span className="text-slate-400">
                {shipment.fromLocation?.name || 'Warehouse'} → FBA {shipment.destinationFc || 'US'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!isShipped && (
              <>
                <Button variant="outline" onClick={saveShipment} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button onClick={markAsShipped}>
                  <Truck className="w-4 h-4 mr-2" />
                  Mark as Shipped
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Items Section */}
        <div ref={itemsRef}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                  onClick={() => setExpandedSections(s => ({ ...s, items: !s.items }))}
                >
                  <Package className="w-5 h-5 text-cyan-400" />
                  <CardTitle>Items ({shipment.items.length} SKUs, {totalUnits} units)</CardTitle>
                  {expandedSections.items ? <ChevronUp className="ml-2" /> : <ChevronDown className="ml-2" />}
                </div>
                {!isShipped && shipment.status === 'draft' && (
                  <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                    Click qty to edit
                  </span>
                )}
              </div>
            </CardHeader>
            {expandedSections.items && (
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">SKU</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Product</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">FNSKU</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Qty</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Pick Status</th>
                        {!isShipped && shipment.status === 'draft' && (
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-400"></th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.items.map(item => (
                        <tr key={item.id} className="border-b border-slate-800">
                          <td className="py-3 px-4 text-white font-mono">{item.masterSku}</td>
                          <td className="py-3 px-4 text-slate-300">{item.productName}</td>
                          <td className="py-3 px-4 text-slate-400">{item.fnsku || '—'}</td>
                          <td className="py-3 px-4">
                            {!isShipped && shipment.status === 'draft' ? (
                              <input
                                type="number"
                                min="1"
                                value={item.adjustedQty}
                                onChange={(e) => updateItemQty(item.id, parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm font-bold"
                              />
                            ) : (
                              <span className="text-white font-bold">{item.adjustedQty}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              item.pickStatus === 'picked' 
                                ? 'bg-emerald-900/50 text-emerald-400' 
                                : 'bg-slate-700 text-slate-300'
                            }`}>
                              {item.pickStatus === 'picked' ? '✓ Picked' : 'Pending'}
                            </span>
                          </td>
                          {!isShipped && shipment.status === 'draft' && (
                            <td className="py-3 px-4">
                              <button
                                onClick={() => removeItem(item.id)}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Picking Section */}
        <div ref={pickingRef}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedSections(s => ({ ...s, picking: !s.picking }))}>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-cyan-400" />
                  <CardTitle>Picking</CardTitle>
                </div>
                {expandedSections.picking ? <ChevronUp /> : <ChevronDown />}
              </div>
            </CardHeader>
            {expandedSections.picking && (
              <CardContent>
                {shipment.items.every(i => i.pickStatus === 'picked') ? (
                  <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-emerald-400 font-medium">All items picked!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <Button onClick={generatePackingListPDF}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print Packing List
                      </Button>
                      <Button variant="outline" onClick={markPickingComplete}>
                        <Check className="w-4 h-4 mr-2" />
                        Mark All Picked
                      </Button>
                    </div>
                    <p className="text-sm text-slate-400">
                      Use the packing list to pick items from your warehouse, then mark as picked.
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Box Creation Section */}
        <div ref={boxesRef}>
          <BoxCreation
            shipmentItems={shipment.items.map(i => ({
              sku: i.masterSku,
              productName: i.productName,
              adjustedQty: i.adjustedQty,
            }))}
            boxes={shipment.boxes}
            onBoxesChange={(boxes) => setShipment({ ...shipment, boxes })}
            autoSplitEnabled={shipment.optimalPlacementEnabled}
          />
        </div>

        {/* Shipped Status */}
        {isShipped && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-400">
                <Truck className="w-5 h-5" />
                Shipment Shipped
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Shipped Date</p>
                  <p className="text-white">
                    {shipment.shippedAt ? new Date(shipment.shippedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Carrier</p>
                  <p className="text-white">{shipment.carrier || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Tracking Number</p>
                  <p className="text-white font-mono">{shipment.trackingNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Amazon Shipment ID</p>
                  <p className="text-white font-mono">{shipment.amazonShipmentId || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spacer for sticky footer */}
        <div className="h-24"></div>
      </div>

      {/* Sticky Footer Action Bar */}
      {!isShipped && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900 to-slate-900/95 border-t border-slate-700 p-4 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-slate-300">
              <span className="font-bold text-white">{shipment.items.length}</span> SKUs · 
              <span className="font-bold text-white ml-1">{totalUnits}</span> units · 
              <span className="font-bold text-white ml-1">{shipment.boxes.length}</span> boxes
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push('/fba-shipments')}>
                Back to List
              </Button>
              <Button variant="outline" onClick={saveShipment} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={markAsShipped}>
                <Truck className="w-4 h-4 mr-2" />
                Mark as Shipped
              </Button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}

