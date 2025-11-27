'use client'

import { useState, useEffect } from 'react'
import { Package, Plus, Trash2, Wand2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

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

interface BoxCreationProps {
  shipmentItems: ShipmentItem[]
  boxes: Box[]
  onBoxesChange: (boxes: Box[]) => void
}

export default function BoxCreation({
  shipmentItems,
  boxes,
  onBoxesChange,
}: BoxCreationProps) {
  const [showDimensions, setShowDimensions] = useState(false)
  const [bulkDimensions, setBulkDimensions] = useState({
    length: 18,
    width: 14,
    height: 8,
    weight: 25,
    applyToBoxes: [] as number[],
  })

  // Auto-split to 5 boxes
  const autoSplitToBoxes = (numBoxes: number = 5) => {
    const newBoxes: Box[] = []

    for (let i = 0; i < numBoxes; i++) {
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

    // Distribute items evenly across boxes
    for (const item of shipmentItems) {
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
  }

  // Add a new empty box
  const addBox = () => {
    const newBox: Box = {
      id: Date.now(),
      boxNumber: boxes.length + 1,
      items: [],
      lengthInches: 18,
      widthInches: 14,
      heightInches: 8,
    }
    onBoxesChange([...boxes, newBox])
  }

  // Remove a box
  const removeBox = (boxId: number) => {
    const newBoxes = boxes
      .filter(b => b.id !== boxId)
      .map((b, i) => ({ ...b, boxNumber: i + 1 }))
    onBoxesChange(newBoxes)
  }

  // Update box item quantity
  const updateBoxItemQty = (boxId: number, sku: string, quantity: number) => {
    const newBoxes = boxes.map(box => {
      if (box.id === boxId) {
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

  // Update box dimensions
  const updateBoxDimensions = (
    boxId: number,
    field: 'lengthInches' | 'widthInches' | 'heightInches' | 'weightLbs',
    value: number
  ) => {
    const newBoxes = boxes.map(box => {
      if (box.id === boxId) {
        return { ...box, [field]: value }
      }
      return box
    })
    onBoxesChange(newBoxes)
  }

  // Apply bulk dimensions
  const applyBulkDimensions = () => {
    const boxesToUpdate = bulkDimensions.applyToBoxes.length > 0
      ? bulkDimensions.applyToBoxes
      : boxes.map(b => b.id)

    const newBoxes = boxes.map(box => {
      if (boxesToUpdate.includes(box.id)) {
        return {
          ...box,
          lengthInches: bulkDimensions.length,
          widthInches: bulkDimensions.width,
          heightInches: bulkDimensions.height,
          weightLbs: bulkDimensions.weight,
        }
      }
      return box
    })
    onBoxesChange(newBoxes)
    setShowDimensions(false)
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
  const allAssigned = Object.values(skuTotals).every(t => t.assigned === t.needed)
  const allBoxesHaveDimensions = boxes.every(b => 
    b.lengthInches && b.widthInches && b.heightInches && b.weightLbs
  )

  // Validation
  const getValidationErrors = () => {
    const errors: string[] = []
    
    for (const [sku, totals] of Object.entries(skuTotals)) {
      if (totals.assigned < totals.needed) {
        errors.push(`${sku}: ${totals.assigned} assigned, need ${totals.needed - totals.assigned} more`)
      } else if (totals.assigned > totals.needed) {
        errors.push(`${sku}: ${totals.assigned} assigned, ${totals.assigned - totals.needed} over`)
      }
    }

    for (const box of boxes) {
      if (!box.weightLbs) {
        errors.push(`Box ${box.boxNumber}: Missing weight`)
      }
      if (box.weightLbs && box.weightLbs > 50) {
        errors.push(`Box ${box.boxNumber}: Weight exceeds 50 lb limit`)
      }
    }

    return errors
  }

  const validationErrors = getValidationErrors()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Box Contents
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoSplitToBoxes(5)}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Auto-Split to 5 Boxes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={addBox}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Box
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {boxes.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No boxes created yet</p>
            <p className="text-sm mt-1">Click "Auto-Split to 5 Boxes" or "Add Box" to get started</p>
          </div>
        ) : (
          <>
            {/* Quantity Grid */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">SKU</th>
                    {boxes.map(box => (
                      <th key={box.id} className="text-center py-3 px-2 text-sm font-medium text-slate-400">
                        Box {box.boxNumber}
                      </th>
                    ))}
                    <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Total</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Need</th>
                  </tr>
                </thead>
                <tbody>
                  {shipmentItems.map(item => {
                    const totals = skuTotals[item.sku]
                    const isMatch = totals.assigned === totals.needed
                    const isOver = totals.assigned > totals.needed
                    
                    return (
                      <tr key={item.sku} className="border-b border-slate-800">
                        <td className="py-3 px-4">
                          <div className="text-white font-medium">{item.sku}</div>
                          <div className="text-slate-500 text-xs truncate max-w-[150px]">
                            {item.productName}
                          </div>
                        </td>
                        {boxes.map(box => {
                          const boxItem = box.items.find(i => i.sku === item.sku)
                          return (
                            <td key={box.id} className="py-3 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                value={boxItem?.quantity || ''}
                                onChange={(e) => updateBoxItemQty(
                                  box.id,
                                  item.sku,
                                  parseInt(e.target.value) || 0
                                )}
                                className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm text-center"
                                placeholder="0"
                              />
                            </td>
                          )
                        })}
                        <td className={`py-3 px-4 text-center font-medium ${
                          isMatch ? 'text-emerald-400' : isOver ? 'text-red-400' : 'text-amber-400'
                        }`}>
                          {totals.assigned}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400">
                          {totals.needed}
                          {isMatch && <span className="ml-1 text-emerald-400">✓</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800/50">
                    <td className="py-3 px-4 text-sm font-medium text-slate-400">Box Total</td>
                    {boxes.map(box => {
                      const boxTotal = box.items.reduce((sum, i) => sum + i.quantity, 0)
                      return (
                        <td key={box.id} className="py-3 px-2 text-center text-white font-bold">
                          {boxTotal}
                        </td>
                      )
                    })}
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Box Dimensions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-300">Box Dimensions & Weight</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDimensions(!showDimensions)}
                >
                  Apply to Multiple
                </Button>
              </div>

              {showDimensions && (
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Length (in)</label>
                      <input
                        type="number"
                        value={bulkDimensions.length}
                        onChange={(e) => setBulkDimensions({
                          ...bulkDimensions,
                          length: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Width (in)</label>
                      <input
                        type="number"
                        value={bulkDimensions.width}
                        onChange={(e) => setBulkDimensions({
                          ...bulkDimensions,
                          width: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Height (in)</label>
                      <input
                        type="number"
                        value={bulkDimensions.height}
                        onChange={(e) => setBulkDimensions({
                          ...bulkDimensions,
                          height: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Weight (lbs)</label>
                      <input
                        type="number"
                        value={bulkDimensions.weight}
                        onChange={(e) => setBulkDimensions({
                          ...bulkDimensions,
                          weight: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-2">
                      {boxes.map(box => (
                        <label key={box.id} className="flex items-center gap-1 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={bulkDimensions.applyToBoxes.includes(box.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkDimensions({
                                  ...bulkDimensions,
                                  applyToBoxes: [...bulkDimensions.applyToBoxes, box.id]
                                })
                              } else {
                                setBulkDimensions({
                                  ...bulkDimensions,
                                  applyToBoxes: bulkDimensions.applyToBoxes.filter(id => id !== box.id)
                                })
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
                          />
                          Box {box.boxNumber}
                        </label>
                      ))}
                    </div>
                    <Button size="sm" onClick={applyBulkDimensions}>
                      Apply to Selected
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {boxes.map(box => {
                  const boxTotal = box.items.reduce((sum, i) => sum + i.quantity, 0)
                  const isComplete = box.lengthInches && box.widthInches && box.heightInches && box.weightLbs
                  const isOverweight = (box.weightLbs || 0) > 50

                  return (
                    <div
                      key={box.id}
                      className={`p-4 rounded-lg border ${
                        isComplete && !isOverweight
                          ? 'bg-slate-800/30 border-emerald-500/30'
                          : isOverweight
                          ? 'bg-red-900/20 border-red-500/30'
                          : 'bg-slate-800/30 border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-white">Box {box.boxNumber}</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-400">{boxTotal} units</span>
                          <button
                            onClick={() => removeBox(box.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">L</label>
                          <input
                            type="number"
                            value={box.lengthInches || ''}
                            onChange={(e) => updateBoxDimensions(box.id, 'lengthInches', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                            placeholder="18"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">W</label>
                          <input
                            type="number"
                            value={box.widthInches || ''}
                            onChange={(e) => updateBoxDimensions(box.id, 'widthInches', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                            placeholder="14"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">H</label>
                          <input
                            type="number"
                            value={box.heightInches || ''}
                            onChange={(e) => updateBoxDimensions(box.id, 'heightInches', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                            placeholder="8"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">lbs</label>
                          <input
                            type="number"
                            value={box.weightLbs || ''}
                            onChange={(e) => updateBoxDimensions(box.id, 'weightLbs', parseFloat(e.target.value) || 0)}
                            className={`w-full px-2 py-1 border rounded text-sm ${
                              isOverweight
                                ? 'bg-red-900/50 border-red-500 text-red-300'
                                : 'bg-slate-900 border-slate-700 text-white'
                            }`}
                            placeholder="25"
                          />
                        </div>
                      </div>
                      {isComplete && !isOverweight && (
                        <div className="mt-2 text-xs text-emerald-400">✓ Complete</div>
                      )}
                      {isOverweight && (
                        <div className="mt-2 text-xs text-red-400">⚠ Exceeds 50 lb limit</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Validation Summary */}
            {validationErrors.length > 0 && (
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
                <h4 className="font-medium text-amber-400 mb-2">⚠ Validation Issues</h4>
                <ul className="text-sm text-amber-300 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Success Summary */}
            {allAssigned && allBoxesHaveDimensions && validationErrors.length === 0 && (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4">
                <h4 className="font-medium text-emerald-400">✓ All items assigned to boxes</h4>
                <p className="text-sm text-emerald-300 mt-1">
                  {boxes.length} boxes ready with complete dimensions and weights
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

