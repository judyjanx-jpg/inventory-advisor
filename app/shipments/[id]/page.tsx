'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ShipmentSummaryBar, { ShipmentStage } from '@/components/shipments/ShipmentSummaryBar'
import BoxCreation from '@/components/shipments/BoxCreation'
import PickingSection from '@/components/shipments/PickingSection'
import ProductLabelPrinter from '@/components/shipments/ProductLabelPrinter'
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
  AlertTriangle,
  Download
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
  warehouseLocation?: string | null
  labelType?: string
  transparencyEnabled?: boolean
  prepOwner?: 'AMAZON' | 'SELLER' | 'NONE'
  labelOwner?: 'AMAZON' | 'SELLER' | 'NONE'
}

// Types for interactive FBA submission workflow
interface PlacementOption {
  placementOptionId: string
  shipmentIds: string[]
  status: string
  fees: Array<{ type: string; value: { amount: number; code: string } }>
  totalFee: number
}

interface TransportOption {
  transportationOptionId: string
  shippingMode: string
  shippingSolution: string
  carrier?: { name: string }
  quote?: { 
    price?: { amount: number; code: string }
    cost?: { amount: number; code: string }
  }
}

interface ShipmentSplit {
  amazonShipmentId: string
  destinationFc: string | null
  transportationOptions: TransportOption[]
}

type SubmissionStep = 'idle' | 'getting_options' | 'selecting_placement' | 'selecting_transport' | 'confirming' | 'done' | 'error'

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
            fnsku: item.fnsku || item.product?.fnsku || null,
            productName: item.productName || item.product?.title,
            requestedQty: item.requestedQty,
            adjustedQty: item.adjustedQty,
            pickStatus: item.pickStatus || 'pending',
            pickedAt: item.pickedAt,
            warehouseLocation: item.product?.warehouseLocation || null,
            labelType: item.product?.labelType || 'fnsku_only',
            transparencyEnabled: item.product?.transparencyEnabled || false,
            prepOwner: item.product?.prepOwner || 'NONE',
            labelOwner: item.product?.labelOwner || 'NONE',
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

  const handleItemPrepChange = async (sku: string, field: 'prepOwner' | 'labelOwner', value: 'AMAZON' | 'SELLER' | 'NONE') => {
    if (!shipment) return
    
    // Update local state immediately
    setShipment({
      ...shipment,
      items: shipment.items.map(item =>
        item.masterSku === sku
          ? { ...item, [field]: value }
          : item
      ),
    })

    // Save to backend
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const data = await res.json()
        console.error(`Error updating ${field}:`, data.error)
        // Revert on error
        await fetchShipment()
      }
    } catch (error) {
      console.error(`Error updating ${field}:`, error)
      // Revert on error
      await fetchShipment()
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

  // Handle inventory adjustment when discrepancy found during picking
  const handleInventoryAdjust = async (sku: string, newQty: number, reason: string) => {
    if (!shipment) return

    try {
      // Update warehouse inventory
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          newQty,
          reason,
          warehouseId: shipment.fromLocationId,
          adjustedBy: 'shipment-pick',
          shipmentId: shipment.id,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(`Failed to adjust inventory: ${data.error}`)
        return
      }

      alert(`Inventory for ${sku} adjusted to ${newQty}. Reason: ${reason}`)
    } catch (error) {
      console.error('Error adjusting inventory:', error)
      alert('Failed to adjust inventory')
    }
  }

  // Interactive FBA submission workflow
  const [submittingToAmazon, setSubmittingToAmazon] = useState(false)
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep>('idle')
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [inboundPlanId, setInboundPlanId] = useState<string | null>(null)
  const [placementOptions, setPlacementOptions] = useState<PlacementOption[]>([])
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null)
  const [shipmentSplits, setShipmentSplits] = useState<ShipmentSplit[]>([])
  const [selectedTransports, setSelectedTransports] = useState<Record<string, string>>({})
  const [confirmedShipments, setConfirmedShipments] = useState<Array<{
    amazonShipmentId: string
    amazonShipmentConfirmationId: string | null
    destinationFc: string | null
    carrier: string | null
    deliveryWindow: string | null
    labelUrl: string | null
  }>>([])
  const [showSubmissionModal, setShowSubmissionModal] = useState(false)

  // Start the interactive submission workflow
  const submitToAmazon = async () => {
    if (!shipment) return

    // Validation - all items must be picked
    const allPicked = shipment.items.every(i => i.pickStatus === 'picked' || i.pickStatus === 'skipped')
    if (!allPicked) {
      alert('Please complete picking before submitting to Amazon')
      return
    }

    // Validation - all items must be assigned to boxes
    const allItemsAssigned = shipment.items.every(item => {
      const boxTotal = shipment.boxes.reduce((sum, box) => {
        const boxItem = box.items.find(bi => bi.sku === item.masterSku)
        return sum + (boxItem?.quantity || 0)
      }, 0)
      return boxTotal === item.adjustedQty
    })

    if (!allItemsAssigned) {
      alert('Please assign all items to boxes before submitting')
      return
    }

    const allBoxesComplete = shipment.boxes.every(box =>
      box.lengthInches && box.widthInches && box.heightInches && box.weightLbs
    )

    if (!allBoxesComplete) {
      alert('Please complete dimensions and weight for all boxes')
      return
    }

    // Reset state and show modal
    setSubmissionStep('getting_options')
    setSubmissionError(null)
    setPlacementOptions([])
    setSelectedPlacementId(null)
    setShipmentSplits([])
    setSelectedTransports({})
    setConfirmedShipments([])
    setShowSubmissionModal(true)
    setSubmittingToAmazon(true)

    try {
      // First, save the shipment to ensure all boxes are persisted
      const saveRes = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxes: shipment.boxes,
          items: shipment.items.map(item => ({
            id: item.id,
            adjustedQty: item.adjustedQty,
            requestedQty: item.requestedQty,
            pickStatus: item.pickStatus,
          })),
        }),
      })

      if (!saveRes.ok) {
        const saveData = await saveRes.json()
        throw new Error(`Failed to save shipment: ${saveData.error}`)
      }

      // Step 1: Get placement options from Amazon
      const res = await fetch(`/api/shipments/${shipmentId}/submit-to-amazon?step=get_placement_options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get placement options')
      }

      setInboundPlanId(data.inboundPlanId)

      // Check if shipment is already fully submitted
      if (data.alreadySubmitted) {
        console.log('Shipment already submitted to Amazon')
        setConfirmedShipments(data.shipments)
        setSubmissionStep('done')
        return
      }

      // Check if we should skip to transport (placement already confirmed)
      if (data.skipToTransport) {
        console.log('Placement already confirmed, skipping to transport selection')

        // Validate we have the placementOptionId
        if (!data.placementOptionId) {
          throw new Error('Placement was confirmed but placementOptionId is missing. Please contact support.')
        }

        setSelectedPlacementId(data.placementOptionId)
        // Automatically proceed to get transport options
        setSubmissionStep('selecting_transport')

        const transportRes = await fetch(`/api/shipments/${shipmentId}/submit-to-amazon?step=select_placement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placementOptionId: data.placementOptionId }),
        })

        const transportData = await transportRes.json()

        if (!transportRes.ok) {
          throw new Error(transportData.error || 'Failed to get transport options')
        }

        setShipmentSplits(transportData.shipments)

        // Don't auto-select - user must choose their preferred transportation option
        setSelectedTransports({})
      } else {
        console.log('Placement options received:', data.placementOptions?.length, 'options')
        console.log('Recommended option ID:', data.recommendedOptionId)
        setPlacementOptions(data.placementOptions || [])
        setSelectedPlacementId(data.recommendedOptionId || (data.placementOptions?.[0]?.placementOptionId || null))
        setSubmissionStep('selecting_placement')
      }
    } catch (error: any) {
      console.error('Error getting placement options:', error)
      setSubmissionError(error.message || 'Failed to get placement options')
      setSubmissionStep('error')
    } finally {
      setSubmittingToAmazon(false)
    }
  }

  // Step 2: Confirm placement selection and get transport options
  const confirmPlacementSelection = async () => {
    // Validate we have a placement option selected
    const placementId = selectedPlacementId || (placementOptions.length > 0 ? placementOptions[0].placementOptionId : null)

    if (!placementId) {
      setSubmissionError('Please select a placement option first')
      setSubmissionStep('error')
      return
    }

    setSubmittingToAmazon(true)
    setSubmissionStep('selecting_transport')

    try {
      const res = await fetch(`/api/shipments/${shipmentId}/submit-to-amazon?step=select_placement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placementOptionId: placementId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to confirm placement')
      }

      setShipmentSplits(data.shipments)

      // Don't auto-select - let user choose from all available options
      // User must explicitly select their preferred transportation option
      setSelectedTransports({})
    } catch (error: any) {
      console.error('Error confirming placement:', error)
      setSubmissionError(error.message || 'Failed to confirm placement')
      setSubmissionStep('error')
    } finally {
      setSubmittingToAmazon(false)
    }
  }

  // Step 3: Confirm transport selections and get labels
  const confirmTransportSelections = async () => {
    // Validate we have shipment splits to confirm
    if (shipmentSplits.length === 0) {
      alert('No shipments available to confirm. Please go back and try again.')
      return
    }

    // Validate all shipments have a transport selected
    const missingSelections = shipmentSplits.filter(s => !selectedTransports[s.amazonShipmentId])
    if (missingSelections.length > 0) {
      const missingFCs = missingSelections.map(s => s.destinationFc || s.amazonShipmentId).join(', ')
      alert(`Please select a transportation option for all shipments.\n\nMissing selections for: ${missingFCs}`)
      return
    }

    setSubmittingToAmazon(true)
    setSubmissionStep('confirming')

    try {
      const transportSelections = shipmentSplits
        .filter(s => selectedTransports[s.amazonShipmentId]) // Only include valid selections
        .map(s => ({
          amazonShipmentId: s.amazonShipmentId,
          transportationOptionId: selectedTransports[s.amazonShipmentId],
        }))

      // Additional safety check - should never happen due to validation above, but just in case
      if (transportSelections.length === 0) {
        alert('No valid transportation selections found. Please select options for all shipments.')
        setSubmittingToAmazon(false)
        return
      }

      const res = await fetch(`/api/shipments/${shipmentId}/submit-to-amazon?step=confirm_transport_interactive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transportSelections }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to confirm transport')
      }

      setConfirmedShipments(data.shipments)
      setSubmissionStep('done')
      await fetchShipment()
    } catch (error: any) {
      console.error('Error confirming transport:', error)
      setSubmissionError(error.message || 'Failed to confirm transport')
      setSubmissionStep('error')
    } finally {
      setSubmittingToAmazon(false)
    }
  }

  // Close modal and reset
  const closeSubmissionModal = () => {
    setShowSubmissionModal(false)
    setSubmissionStep('idle')
    setSubmissionError(null)
  }

  // Calculate total shipping cost
  const calculateTotalShippingCost = () => {
    let total = 0
    for (const split of shipmentSplits) {
      const selectedId = selectedTransports[split.amazonShipmentId]
      const option = split.transportationOptions.find(t => t.transportationOptionId === selectedId)
      const amount = option?.quote?.price?.amount || option?.quote?.cost?.amount || 0
      if (amount) {
        total += amount
      }
    }
    return total
  }

  const markAsShipped = async () => {
    if (!shipment) return
    
    // Must be submitted first
    if (shipment.status !== 'submitted') {
      alert('Please submit the shipment to Amazon first')
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
    const isSubmitted = shipment.status === 'submitted'

    const completed: ShipmentStage[] = []
    if (hasItems) completed.push('create')
    if (allPicked) completed.push('pick')
    if (hasBoxes && allItemsAssigned) {
      completed.push('label')
      if (allBoxesComplete) completed.push('box')
    }
    if (isSubmitted || isShipped) completed.push('submit')
    if (isShipped) completed.push('ship')

    let current: ShipmentStage = 'create'
    if (hasItems && !allPicked) current = 'pick'
    else if (allPicked && (!hasBoxes || !allItemsAssigned)) current = 'box'
    else if (allBoxesComplete && !isSubmitted && !isShipped) current = 'submit'
    else if (isSubmitted && !isShipped) current = 'ship'

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
                {shipment.status === 'draft' ? (
                  <Button onClick={submitToAmazon} disabled={submittingToAmazon}>
                    <Package className="w-4 h-4 mr-2" />
                    {submittingToAmazon ? 'Submitting...' : 'Submit to Amazon'}
                  </Button>
                ) : shipment.status === 'submitted' ? (
                  <Button onClick={markAsShipped}>
                    <Truck className="w-4 h-4 mr-2" />
                    Mark as Shipped
                  </Button>
                ) : null}
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
          <PickingSection
            shipmentId={String(shipment.id)}
            shipmentInternalId={shipment.internalId || `SHP-${shipment.id}`}
            items={shipment.items}
            onItemsChange={(items: any) => setShipment({ ...shipment, items })}
            onPickComplete={() => {}}
            onInventoryAdjust={handleInventoryAdjust}
          />
        </div>

        {/* Product Labels Section */}
        <ProductLabelPrinter
          shipmentId={String(shipment.id)}
          shipmentInternalId={shipment.internalId || `SHP-${shipment.id}`}
          items={shipment.items.map(i => ({
            masterSku: i.masterSku,
            fnsku: i.fnsku,
            productName: i.productName,
            adjustedQty: i.adjustedQty,
            labelType: i.labelType,
            transparencyEnabled: i.transparencyEnabled,
          }))}
        />

        {/* Box Creation Section */}
        <div ref={boxesRef}>
          <BoxCreation
            shipmentItems={shipment.items.map(i => ({
              sku: i.masterSku,
              productName: i.productName,
              adjustedQty: i.adjustedQty,
              prepOwner: i.prepOwner,
              labelOwner: i.labelOwner,
            }))}
            boxes={shipment.boxes}
            onBoxesChange={(boxes) => setShipment({ ...shipment, boxes })}
            onItemPrepChange={handleItemPrepChange}
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
              {shipment.status === 'submitted' && (
                <span className="ml-3 text-amber-400">📦 Submitted to Amazon</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push('/fba-shipments')}>
                Back to List
              </Button>
              <Button variant="outline" onClick={saveShipment} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {shipment.status === 'draft' ? (
                <Button onClick={submitToAmazon} disabled={submittingToAmazon}>
                  <Package className="w-4 h-4 mr-2" />
                  {submittingToAmazon ? 'Submitting...' : 'Submit to Amazon'}
                </Button>
              ) : shipment.status === 'submitted' ? (
                <Button onClick={markAsShipped}>
                  <Truck className="w-4 h-4 mr-2" />
                  Mark as Shipped
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Submission Modal */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b border-slate-700 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Submit to Amazon FBA</h2>
              {submissionStep !== 'confirming' && submissionStep !== 'getting_options' && (
                <button onClick={closeSubmissionModal} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              )}
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Loading / Getting Options */}
              {submissionStep === 'getting_options' && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                  <p className="text-slate-300">Creating inbound plan and getting placement options...</p>
                  <p className="text-slate-500 text-sm mt-2">This may take a minute</p>
                </div>
              )}

              {/* Error State */}
              {submissionStep === 'error' && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <p className="text-red-400 font-medium mb-2">Submission Failed</p>
                  <p className="text-slate-400 text-sm mb-4">{submissionError}</p>
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={closeSubmissionModal}>
                      Close
                    </Button>
                    <Button onClick={() => {
                      setSubmissionError(null)
                      setSubmissionStep('idle')
                      submitToAmazon()
                    }}>
                      Try Again
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 1: Select Placement Option */}
              {submissionStep === 'selecting_placement' && (
                <div>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">1</span>
                      <h3 className="text-lg font-medium text-white">Select Placement Option</h3>
                    </div>
                    <p className="text-slate-400 text-sm ml-8">Choose how Amazon will split your shipment across fulfillment centers</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    {placementOptions.map((option, index) => (
                      <label
                        key={option.placementOptionId}
                        className={`block p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedPlacementId === option.placementOptionId
                            ? 'border-cyan-500 bg-cyan-500/10'
                            : 'border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="placement"
                            value={option.placementOptionId}
                            checked={selectedPlacementId === option.placementOptionId}
                            onChange={() => setSelectedPlacementId(option.placementOptionId)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white">
                                {option.shipmentIds.length} Fulfillment Center{option.shipmentIds.length !== 1 ? 's' : ''}
                                {index === 0 && <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Recommended</span>}
                              </span>
                              <span className={`font-bold ${option.totalFee > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {option.totalFee > 0 ? `$${option.totalFee.toFixed(2)} fee` : 'No fee'}
                              </span>
                            </div>
                            {option.fees.length > 0 && (
                              <div className="text-xs text-slate-500 mt-1">
                                {option.fees.map((fee, i) => (
                                  <span key={i}>
                                    {fee.type}: ${fee.value?.amount?.toFixed(2) || '0.00'}
                                    {i < option.fees.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={closeSubmissionModal}>
                      Cancel
                    </Button>
                    <Button onClick={confirmPlacementSelection} disabled={!selectedPlacementId || submittingToAmazon}>
                      {submittingToAmazon ? 'Loading...' : 'Continue to Shipping'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Select Transport Options */}
              {submissionStep === 'selecting_transport' && (
                <div>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">2</span>
                      <h3 className="text-lg font-medium text-white">Select Shipping Options</h3>
                    </div>
                    <p className="text-slate-400 text-sm ml-8">Choose shipping method for each fulfillment center</p>
                  </div>

                  <div className="mb-4 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                    <p className="text-slate-300 text-sm">
                      <strong className="text-white">Select a transportation option for each shipment:</strong> Review all available options below and choose the best option for each destination. Costs are displayed for each option.
                    </p>
                  </div>

                  <div className="space-y-4 mb-6">
                    {shipmentSplits.length === 0 ? (
                      <div className="border border-amber-500/50 bg-amber-500/10 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-amber-400">
                          <AlertTriangle className="w-5 h-5" />
                          <span className="font-medium">No shipments available</span>
                        </div>
                        <p className="text-slate-400 text-sm mt-2">
                          Unable to load shipment details from Amazon. Please close this dialog and try again, or contact support if the issue persists.
                        </p>
                      </div>
                    ) : shipmentSplits.map((split) => (
                      <div key={split.amazonShipmentId} className="border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="font-medium text-white">Ship to: {split.destinationFc || 'Unknown FC'}</span>
                            <span className="text-slate-500 text-sm ml-2">({split.amazonShipmentId})</span>
                            {!selectedTransports[split.amazonShipmentId] && (
                              <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded">
                                Selection Required
                              </span>
                            )}
                          </div>
                        </div>

                        {split.transportationOptions.length > 0 ? (
                          <div className="space-y-2">
                            {split.transportationOptions.map((option) => (
                              <label
                                key={option.transportationOptionId}
                                className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-all ${
                                  selectedTransports[split.amazonShipmentId] === option.transportationOptionId
                                    ? 'border-cyan-500 bg-cyan-500/10'
                                    : 'border-slate-600 hover:border-slate-500'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="radio"
                                    name={`transport-${split.amazonShipmentId}`}
                                    value={option.transportationOptionId}
                                    checked={selectedTransports[split.amazonShipmentId] === option.transportationOptionId}
                                    onChange={() => setSelectedTransports(prev => ({
                                      ...prev,
                                      [split.amazonShipmentId]: option.transportationOptionId,
                                    }))}
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-white font-medium">
                                        {option.carrier?.name || option.shippingSolution}
                                      </span>
                                      {(option.carrier?.name?.toUpperCase().includes('UPS') || 
                                        option.shippingSolution?.includes('UPS')) && (
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded">
                                          UPS
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      {option.shippingMode === 'GROUND_SMALL_PARCEL' && (
                                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-semibold rounded">
                                          SPD
                                        </span>
                                      )}
                                      {option.shippingMode === 'FREIGHT_LTL' && (
                                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded">
                                          LTL
                                        </span>
                                      )}
                                      {option.shippingMode === 'FREIGHT_FTL' && (
                                        <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-semibold rounded">
                                          FTL
                                        </span>
                                      )}
                                      {option.shippingSolution === 'USE_YOUR_OWN_CARRIER' && (
                                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded">
                                          Own Carrier
                                        </span>
                                      )}
                                      <span className="text-slate-400 text-sm">
                                        {option.shippingMode === 'GROUND_SMALL_PARCEL' ? 'Small Parcel Delivery' : 
                                         option.shippingMode === 'FREIGHT_LTL' ? 'Less Than Truckload' :
                                         option.shippingMode === 'FREIGHT_FTL' ? 'Full Truckload' :
                                         option.shippingMode || 'Standard Shipping'}
                                        {option.shippingSolution === 'AMAZON_PARTNERED_CARRIER' ? ' • Amazon Partnered' : ''}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  {(option.quote?.price?.amount || option.quote?.cost?.amount) ? (
                                    <div>
                                      <span className="font-bold text-lg text-cyan-400">
                                        ${((option.quote?.price?.amount || option.quote?.cost?.amount || 0)).toFixed(2)}
                                      </span>
                                      {(option.quote?.price?.code || option.quote?.cost?.code) && (
                                        <div className="text-xs text-slate-500 mt-0.5">
                                          {option.quote?.price?.code || option.quote?.cost?.code}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-medium text-amber-400">Quote TBD</span>
                                  )}
                                </div>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-amber-400 text-sm">
                            No Amazon partnered shipping available. You'll need to use your own carrier.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Cost Summary - Prominent Display */}
                  <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/30 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-slate-300 text-sm">Total Shipping Cost</span>
                        <p className="text-xs text-slate-400 mt-1">Review costs before confirming</p>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-bold text-cyan-400">
                          ${calculateTotalShippingCost().toFixed(2)}
                        </span>
                        <p className="text-xs text-slate-400 mt-1">USD</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={closeSubmissionModal}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={confirmTransportSelections} 
                      disabled={submittingToAmazon || shipmentSplits.length === 0 || !shipmentSplits.every(s => selectedTransports[s.amazonShipmentId])}
                      className="bg-cyan-500 hover:bg-cyan-600"
                    >
                      {submittingToAmazon ? 'Confirming...' : 'Confirm Shipping & Generate Labels'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Confirming State */}
              {submissionStep === 'confirming' && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                  <p className="text-slate-300">Confirming shipment and generating labels...</p>
                  <p className="text-slate-500 text-sm mt-2">This may take a few minutes</p>
                </div>
              )}

              {/* Step 3: Done - Show Results */}
              {submissionStep === 'done' && (
                <div>
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Shipment Submitted Successfully!</h3>
                    <p className="text-slate-400 text-sm">Your shipment has been submitted to Amazon FBA</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    {confirmedShipments.map((ship) => (
                      <div key={ship.amazonShipmentId} className="border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium text-white">
                              {ship.destinationFc || 'Unknown FC'}
                            </span>
                            <span className="text-slate-500 text-sm ml-2">
                              {ship.amazonShipmentConfirmationId || ship.amazonShipmentId}
                            </span>
                          </div>
                          <span className="text-emerald-400 text-sm">✓ Confirmed</span>
                        </div>
                        {ship.deliveryWindow && (
                          <p className="text-slate-400 text-sm">
                            Delivery Window: {ship.deliveryWindow}
                          </p>
                        )}
                        {ship.labelUrl && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={async () => {
                                // Fetch the label PDF and open it for printing with 4x6 settings
                                try {
                                  const response = await fetch(ship.labelUrl!)
                                  const blob = await response.blob()
                                  const url = URL.createObjectURL(blob)
                                  
                                  // Open PDF in iframe with print styles for 4x6
                                  const printWindow = window.open('', '_blank')
                                  if (printWindow) {
                                    printWindow.document.write(`
                                      <!DOCTYPE html>
                                      <html>
                                        <head>
                                          <title>Amazon Shipping Label - 4x6</title>
                                          <style>
                                            @page {
                                              size: 4in 6in;
                                              margin: 0;
                                            }
                                            body {
                                              margin: 0;
                                              padding: 0;
                                            }
                                            iframe {
                                              width: 100%;
                                              height: 100vh;
                                              border: none;
                                            }
                                            @media print {
                                              iframe {
                                                width: 4in;
                                                height: 6in;
                                              }
                                            }
                                          </style>
                                        </head>
                                        <body>
                                          <iframe src="${url}"></iframe>
                                          <script>
                                            window.onload = function() {
                                              setTimeout(function() {
                                                window.print();
                                                // Clean up after print
                                                setTimeout(function() {
                                                  window.close();
                                                  URL.revokeObjectURL('${url}');
                                                }, 1000);
                                              }, 500);
                                            };
                                          </script>
                                        </body>
                                      </html>
                                    `)
                                    printWindow.document.close()
                                  }
                                } catch (error) {
                                  console.error('Error printing labels:', error)
                                  alert('Failed to load labels for printing. Please try downloading instead.')
                                }
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded text-sm hover:bg-cyan-500/30 cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                              Print 4x6 Labels
                            </button>
                            <a
                              href={ship.labelUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded text-sm hover:bg-slate-700/70"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={closeSubmissionModal}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}

