'use client'

import { useState, useEffect } from 'react'
import { Package, Plus, Trash2, Info } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { useDisplaySettings, formatTitle } from '@/lib/useDisplaySettings'

interface ShipmentItem {
  sku: string
  productName: string
  adjustedQty: number
}

interface BoxItem {
  sku: string
  quantity: number
}

interface Box {
  id: number
  boxNumber: number
  items: BoxItem[]
  lengthInches?: number
  widthInches?: number
  heightInches?: number
  weightLbs?: number
}

interface BoxDimension {
  id: number
  length: number
  width: number
  height: number
  applyToBoxes: number[] // box numbers this dimension applies to
}

interface BoxCreationProps {
  shipmentItems: ShipmentItem[]
  boxes: Box[]
  onBoxesChange: (boxes: Box[]) => void
  autoSplitEnabled?: boolean
}

export default function BoxCreation({
  shipmentItems,
  boxes,
  onBoxesChange,
  autoSplitEnabled = false,
}: BoxCreationProps) {
  const displaySettings = useDisplaySettings()
  const [numBoxes, setNumBoxes] = useState(5)
  const [dimensions, setDimensions] = useState<BoxDimension[]>([
    { id: 1, length: 18, width: 14, height: 8, applyToBoxes: [1, 2, 3, 4, 5] }
  ])
  const [hasAutoSplit, setHasAutoSplit] = useState(false)

  // Auto-split items evenly across boxes
  const autoSplitItems = (targetBoxes?: Box[]) => {
    const boxesToUse = targetBoxes || boxes
    if (boxesToUse.length === 0 || shipmentItems.length === 0) return

    const newBoxes = boxesToUse.map(box => ({
      ...box,
      items: [] as BoxItem[],
    }))

    // Distribute each SKU evenly across boxes
    for (const item of shipmentItems) {
      const numBoxes = newBoxes.length
      const baseQty = Math.floor(item.adjustedQty / numBoxes)
      const remainder = item.adjustedQty % numBoxes

      for (let i = 0; i < numBoxes; i++) {
        const boxQty = baseQty + (i < remainder ? 1 : 0)
        if (boxQty > 0) {
          newBoxes[i].items.push({
            sku: item.sku,
            quantity: boxQty,
          })
        }
      }
    }

    onBoxesChange(newBoxes)
    setHasAutoSplit(true)
  }

  // Initialize boxes if empty
  useEffect(() => {
    if (boxes.length === 0) {
      initializeBoxes(numBoxes)
    }
  }, [])

  // Auto-split on first load if enabled and items exist
  useEffect(() => {
    if (autoSplitEnabled && !hasAutoSplit && boxes.length > 0 && shipmentItems.length > 0) {
      // Check if boxes are empty (no items assigned yet)
      const boxesEmpty = boxes.every(box => box.items.length === 0)
      if (boxesEmpty) {
        autoSplitItems()
      }
    }
  }, [autoSplitEnabled, boxes, shipmentItems, hasAutoSplit])

  const initializeBoxes = (count: number) => {
    const newBoxes: Box[] = []
    for (let i = 0; i < count; i++) {
      newBoxes.push({
        id: Date.now() + i,
        boxNumber: i + 1,
        items: [],
        lengthInches: 18,
        widthInches: 14,
        heightInches: 8,
        weightLbs: undefined,
      })
    }
    onBoxesChange(newBoxes)
  }

  // Add a new box
  const addBox = () => {
    const newBoxNumber = boxes.length + 1
    const newBox: Box = {
      id: Date.now(),
      boxNumber: newBoxNumber,
      items: [],
      lengthInches: dimensions[0]?.length || 18,
      widthInches: dimensions[0]?.width || 14,
      heightInches: dimensions[0]?.height || 8,
    }
    onBoxesChange([...boxes, newBox])
    setNumBoxes(newBoxNumber)
    
    // Add new box to first dimension group
    if (dimensions.length === 1) {
      setDimensions([{
        ...dimensions[0],
        applyToBoxes: [...dimensions[0].applyToBoxes, newBoxNumber]
      }])
    }
  }

  // Remove last box
  const removeBox = () => {
    if (boxes.length <= 1) return
    const newBoxes = boxes.slice(0, -1)
    onBoxesChange(newBoxes)
    setNumBoxes(newBoxes.length)
    
    // Update dimensions to remove reference to deleted box
    setDimensions(dimensions.map(d => ({
      ...d,
      applyToBoxes: d.applyToBoxes.filter(b => b <= newBoxes.length)
    })))
  }

  // Update box item quantity
  const updateBoxItemQty = (boxNumber: number, sku: string, quantity: number) => {
    const newBoxes = boxes.map(box => {
      if (box.boxNumber === boxNumber) {
        const existingItem = box.items.find(i => i.sku === sku)
        if (existingItem) {
          if (quantity <= 0) {
            return { ...box, items: box.items.filter(i => i.sku !== sku) }
          }
          return {
            ...box,
            items: box.items.map(i => i.sku === sku ? { ...i, quantity } : i),
          }
        } else if (quantity > 0) {
          return { ...box, items: [...box.items, { sku, quantity }] }
        }
      }
      return box
    })
    onBoxesChange(newBoxes)
  }

  // Update box weight
  const updateBoxWeight = (boxNumber: number, weight: number) => {
    const newBoxes = boxes.map(box => {
      if (box.boxNumber === boxNumber) {
        return { ...box, weightLbs: weight || undefined }
      }
      return box
    })
    onBoxesChange(newBoxes)
  }

  // Update dimension and apply to boxes
  const updateDimension = (dimId: number, field: 'length' | 'width' | 'height', value: number) => {
    const newDimensions = dimensions.map(d => {
      if (d.id === dimId) {
        return { ...d, [field]: value }
      }
      return d
    })
    setDimensions(newDimensions)

    // Apply to boxes
    const dim = newDimensions.find(d => d.id === dimId)
    if (dim) {
      const newBoxes = boxes.map(box => {
        if (dim.applyToBoxes.includes(box.boxNumber)) {
          return {
            ...box,
            lengthInches: dim.length,
            widthInches: dim.width,
            heightInches: dim.height,
          }
        }
        return box
      })
      onBoxesChange(newBoxes)
    }
  }

  // Add another dimension group
  const addDimensionGroup = () => {
    const unassignedBoxes = boxes
      .map(b => b.boxNumber)
      .filter(bn => !dimensions.some(d => d.applyToBoxes.includes(bn)))
    
    setDimensions([
      ...dimensions,
      {
        id: Date.now(),
        length: 18,
        width: 14,
        height: 8,
        applyToBoxes: unassignedBoxes.length > 0 ? unassignedBoxes : [],
      }
    ])
  }

  // Toggle box assignment to dimension group
  const toggleBoxDimension = (dimId: number, boxNumber: number) => {
    setDimensions(dimensions.map(d => {
      if (d.id === dimId) {
        const hasBox = d.applyToBoxes.includes(boxNumber)
        const newApplyTo = hasBox
          ? d.applyToBoxes.filter(b => b !== boxNumber)
          : [...d.applyToBoxes, boxNumber]
        return { ...d, applyToBoxes: newApplyTo }
      }
      // Remove from other groups
      return {
        ...d,
        applyToBoxes: d.applyToBoxes.filter(b => b !== boxNumber)
      }
    }))

    // Apply dimension to box
    const dim = dimensions.find(d => d.id === dimId)
    if (dim && !dim.applyToBoxes.includes(boxNumber)) {
      const newBoxes = boxes.map(box => {
        if (box.boxNumber === boxNumber) {
          return {
            ...box,
            lengthInches: dim.length,
            widthInches: dim.width,
            heightInches: dim.height,
          }
        }
        return box
      })
      onBoxesChange(newBoxes)
    }
  }

  // Remove dimension group
  const removeDimensionGroup = (dimId: number) => {
    if (dimensions.length <= 1) return
    setDimensions(dimensions.filter(d => d.id !== dimId))
  }

  // Calculate totals
  const getSkuTotals = () => {
    const totals: Record<string, { assigned: number; needed: number }> = {}
    
    for (const item of shipmentItems) {
      totals[item.sku] = { assigned: 0, needed: item.adjustedQty }
    }

    for (const box of boxes) {
      for (const boxItem of box.items) {
        if (totals[boxItem.sku]) {
          totals[boxItem.sku].assigned += boxItem.quantity
        }
      }
    }

    return totals
  }

  const skuTotals = getSkuTotals()
  const totalAssigned = Object.values(skuTotals).reduce((sum, t) => sum + t.assigned, 0)
  const totalNeeded = Object.values(skuTotals).reduce((sum, t) => sum + t.needed, 0)
  const totalWeight = boxes.reduce((sum, b) => sum + (b.weightLbs || 0), 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Box Contents
          </CardTitle>
          <div className="flex items-center gap-4">
            <button
              onClick={() => autoSplitItems()}
              className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium"
            >
              Auto-Split Evenly
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={removeBox}
                disabled={boxes.length <= 1}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded"
              >
                −
              </button>
              <span className="text-white font-medium">{boxes.length} boxes</span>
              <button
                onClick={addBox}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* SKU Grid */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-400 min-w-[250px]">
                  SKU details
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-400 min-w-[100px]">
                  Units boxed
                  <Info className="w-3 h-3 inline ml-1 opacity-50" />
                </th>
                {boxes.map(box => (
                  <th key={box.boxNumber} className="text-center py-3 px-2 text-sm font-medium text-slate-400 min-w-[70px]">
                    Box {box.boxNumber}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shipmentItems.map(item => {
                const totals = skuTotals[item.sku]
                const isComplete = totals.assigned === totals.needed
                const isOver = totals.assigned > totals.needed
                
                return (
                  <tr key={item.sku} className="border-b border-slate-800">
                    <td className="py-3 px-4">
                      <div className="text-white font-medium text-sm">{item.sku}</div>
                      {formatTitle(item.productName, displaySettings) && (
                        <div className="text-slate-500 text-xs mt-0.5">
                          {formatTitle(item.productName, displaySettings)}
                        </div>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-center font-medium ${
                      isComplete ? 'text-emerald-400' : isOver ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {totals.assigned} of {totals.needed}
                    </td>
                    {boxes.map(box => {
                      const boxItem = box.items.find(i => i.sku === item.sku)
                      return (
                        <td key={box.boxNumber} className="py-3 px-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={boxItem?.quantity || ''}
                            onChange={(e) => updateBoxItemQty(
                              box.boxNumber,
                              item.sku,
                              parseInt(e.target.value) || 0
                            )}
                            className="w-14 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm text-center focus:border-cyan-500 focus:outline-none"
                            placeholder=""
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {/* Summary Row */}
              <tr className="border-t border-slate-700 bg-slate-800/30">
                <td className="py-3 px-4 text-sm font-medium text-slate-300">
                  Total SKUs: {shipmentItems.length}
                </td>
                <td className={`py-3 px-4 text-center font-medium ${
                  totalAssigned === totalNeeded ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  Units boxed: {totalAssigned} of {totalNeeded}
                </td>
                <td colSpan={boxes.length} className="py-3 px-4 text-sm text-slate-400">
                  Enter the box contents above and the box weights and dimensions below
                  <Info className="w-3 h-3 inline ml-1 opacity-50" />
                </td>
              </tr>

              {/* Box Weight Row */}
              <tr className="border-t border-slate-700">
                <td className="py-3 px-4 text-sm font-medium text-slate-300 text-right" colSpan={2}>
                  Box weight (lb):
                </td>
                {boxes.map(box => (
                  <td key={box.boxNumber} className="py-3 px-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={box.weightLbs || ''}
                      onChange={(e) => updateBoxWeight(box.boxNumber, parseFloat(e.target.value) || 0)}
                      className={`w-14 px-2 py-1.5 border rounded text-sm text-center focus:outline-none ${
                        box.weightLbs && box.weightLbs > 50
                          ? 'bg-red-900/50 border-red-500 text-red-300'
                          : 'bg-slate-800 border-slate-600 text-white focus:border-cyan-500'
                      }`}
                      placeholder=""
                    />
                  </td>
                ))}
              </tr>

              {/* Total Weight Row */}
              <tr>
                <td colSpan={2}></td>
                <td colSpan={boxes.length} className="py-2 px-4 text-right text-sm">
                  <span className={`${totalWeight > 0 ? 'text-white' : 'text-slate-500'}`}>
                    Total weight: <span className="font-bold">{totalWeight} lb</span>
                    {boxes.some(b => (b.weightLbs || 0) > 50) && (
                      <span className="text-red-400 ml-2">⚠ Exceeds 50 lb</span>
                    )}
                  </span>
                </td>
              </tr>

              {/* Box Dimensions Rows */}
              {dimensions.map((dim, dimIndex) => (
                <tr key={dim.id} className={dimIndex === 0 ? "border-t border-slate-700" : ""}>
                  <td className="py-3 px-4 text-sm font-medium text-slate-300 text-right align-middle" colSpan={2}>
                    <div className="flex items-center justify-end gap-2">
                      {dimensions.length > 1 && (
                        <button
                          onClick={() => removeDimensionGroup(dim.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <span>Box dimensions (in):</span>
                      <input
                        type="number"
                        value={dim.length}
                        onChange={(e) => updateDimension(dim.id, 'length', parseFloat(e.target.value) || 0)}
                        className="w-14 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm text-center focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-slate-500">×</span>
                      <input
                        type="number"
                        value={dim.width}
                        onChange={(e) => updateDimension(dim.id, 'width', parseFloat(e.target.value) || 0)}
                        className="w-14 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm text-center focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-slate-500">×</span>
                      <input
                        type="number"
                        value={dim.height}
                        onChange={(e) => updateDimension(dim.id, 'height', parseFloat(e.target.value) || 0)}
                        className="w-14 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-white text-sm text-center focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </td>
                  {boxes.map(box => (
                    <td key={box.boxNumber} className="py-3 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={dim.applyToBoxes.includes(box.boxNumber)}
                        onChange={() => toggleBoxDimension(dim.id, box.boxNumber)}
                        className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-cyan-500 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
              
              {/* Add another dimension link */}
              <tr>
                <td colSpan={2} className="py-2 px-4 text-right">
                  <button
                    onClick={addDimensionGroup}
                    className="text-cyan-400 hover:text-cyan-300 text-sm inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add another box dimension
                  </button>
                </td>
                <td colSpan={boxes.length}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Validation Summary */}
        {totalAssigned === totalNeeded && boxes.every(b => b.weightLbs) && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 text-center">
            <span className="text-emerald-400 font-medium">
              ✓ All {totalNeeded} units assigned to {boxes.length} boxes
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
