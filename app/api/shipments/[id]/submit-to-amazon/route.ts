import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createInboundPlan,
  generatePackingOptions,
  listPackingOptions,
  confirmPackingOption,
  setPackingInformation,
  generatePlacementOptions,
  listPlacementOptions,
  confirmPlacementOption,
  listShipments,
  getShipment,
  generateTransportationOptions,
  listTransportationOptions,
  generateDeliveryWindowOptions,
  listDeliveryWindowOptions,
  confirmDeliveryWindowOptions,
  confirmTransportationOptions,
  waitForOperation,
  findOptimalPlacementOption,
  findCheapestSpdOption,
  findEarliestDeliveryWindow,
  MARKETPLACES,
  type InboundItem,
  type SourceAddress,
  type ContactInformation,
  type BoxInput,
} from '@/lib/fba-inbound-v2024'
import { createSpApiClient } from '@/lib/amazon-sp-api'

/**
 * POST /api/shipments/:id/submit-to-amazon
 *
 * Submits a shipment to Amazon using the FBA Inbound v2024 API.
 * Executes the full workflow:
 * 1. Create inbound plan
 * 2. Set packing information
 * 3. Generate and confirm placement (Optimal Placement)
 * 4. Generate and confirm transportation (SPD)
 * 5. Generate and confirm delivery windows
 *
 * Query params:
 * - step: 'all' (default) | 'create_plan' | 'set_packing' | 'confirm_placement' | 'confirm_transport'
 *   Allows step-by-step execution for debugging or resuming failed workflows
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now()

  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    const url = new URL(request.url)
    const step = url.searchParams.get('step') || 'all'

    // Get the shipment with all related data
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        fromLocation: true,
        items: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                fnsku: true,
                prepOwner: true,
                labelOwner: true,
              },
            },
          },
        },
        boxes: {
          include: {
            items: true,
          },
          orderBy: { boxNumber: 'asc' },
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // Debug: Log what we got from the database
    console.log(`[${id}] Shipment loaded:`, {
      id: shipment.id,
      status: shipment.status,
      itemCount: shipment.items?.length || 0,
      boxCount: shipment.boxes?.length || 0,
      boxes: shipment.boxes?.map(b => ({
        id: b.id,
        boxNumber: b.boxNumber,
        itemCount: b.items?.length || 0,
      })),
    })

    // Validate shipment is ready for submission
    if (!shipment.fromLocation) {
      return NextResponse.json(
        { error: 'Shipment must have a source warehouse' },
        { status: 400 }
      )
    }

    if (!shipment.items.length) {
      return NextResponse.json(
        { error: 'Shipment must have at least one item' },
        { status: 400 }
      )
    }

    if (!shipment.boxes || !shipment.boxes.length) {
      return NextResponse.json(
        {
          error: 'Shipment must have at least one box with items',
          debug: {
            shipmentId: id,
            boxesLoaded: shipment.boxes,
            itemsCount: shipment.items.length,
          }
        },
        { status: 400 }
      )
    }

    // Check all items are assigned to boxes
    for (const item of shipment.items) {
      const boxTotal = shipment.boxes.reduce((sum, box) => {
        const boxItem = box.items.find(bi => bi.masterSku === item.masterSku)
        return sum + (boxItem?.quantity || 0)
      }, 0)

      if (boxTotal !== item.adjustedQty) {
        return NextResponse.json({
          error: `Item ${item.masterSku}: ${boxTotal} assigned to boxes, but ${item.adjustedQty} required`,
        }, { status: 400 })
      }
    }

    // Check all boxes have dimensions
    for (const box of shipment.boxes) {
      if (!box.lengthInches || !box.widthInches || !box.heightInches || !box.weightLbs) {
        return NextResponse.json({
          error: `Box ${box.boxNumber} is missing dimensions or weight`,
        }, { status: 400 })
      }
    }

    // Determine marketplace (default to US)
    const marketplaceId = shipment.destinationFc === 'CA'
      ? MARKETPLACES.CA
      : shipment.destinationFc === 'UK'
      ? MARKETPLACES.UK
      : MARKETPLACES.US

    // Validate warehouse has complete address for Amazon
    const warehouse = shipment.fromLocation
    const missingFields: string[] = []
    if (!warehouse.address?.trim()) missingFields.push('address')
    if (!warehouse.city?.trim()) missingFields.push('city')
    if (!warehouse.state?.trim()) missingFields.push('state')
    if (!warehouse.zipCode?.trim()) missingFields.push('zip code')
    if (!warehouse.contactPhone?.trim()) missingFields.push('contact phone')

    if (missingFields.length > 0) {
      return NextResponse.json({
        error: `Warehouse "${warehouse.name}" is missing required address fields: ${missingFields.join(', ')}`,
        hint: 'Please update the warehouse address in Settings > Warehouses before submitting to Amazon.',
        missingFields,
        warehouseData: {
          address: warehouse.address || '(empty)',
          city: warehouse.city || '(empty)',
          state: warehouse.state || '(empty)',
          zipCode: warehouse.zipCode || '(empty)',
          contactPhone: warehouse.contactPhone || '(empty)',
        }
      }, { status: 400 })
    }

    // Build source address from warehouse
    const sourceAddress: SourceAddress = {
      name: warehouse.contactName || warehouse.name,
      companyName: warehouse.name,
      addressLine1: warehouse.address!,
      city: warehouse.city!,
      stateOrProvinceCode: warehouse.state!,
      countryCode: warehouse.country || 'US',
      postalCode: warehouse.zipCode!,
      phoneNumber: warehouse.contactPhone!,  // Amazon requires phone in sourceAddress
    }

    // Contact info from warehouse
    const contactInfo: ContactInformation = {
      name: warehouse.contactName || undefined,
      email: warehouse.contactEmail || 'noreply@example.com',
      phoneNumber: warehouse.contactPhone!,
    }

    // Final validation - log what we're about to send
    console.log(`[${id}] Source address:`, JSON.stringify(sourceAddress))
    console.log(`[${id}] Contact info:`, JSON.stringify(contactInfo))

    // Double-check phone number one more time
    if (!contactInfo.phoneNumber || contactInfo.phoneNumber.length === 0) {
      return NextResponse.json({
        error: 'Phone number is still empty after validation - this should not happen',
        warehouseContactPhone: warehouse.contactPhone,
        contactInfoPhone: contactInfo.phoneNumber,
      }, { status: 400 })
    }

    let result: any = { shipmentId: id }

    // ========================================
    // STEP 1: Create Inbound Plan
    // ========================================
    if (step === 'all' || step === 'create_plan') {
      if (shipment.amazonInboundPlanId && step !== 'create_plan') {
        // Plan already exists, skip to next step
        result.inboundPlanId = shipment.amazonInboundPlanId
      } else {
        // Build items list for Amazon
        // prepOwner: NONE for products without prep requirements (most products)
        // labelOwner: SELLER for products that need FNSKU labeling (most FBA products)
        const items: InboundItem[] = shipment.items.map(item => ({
          msku: item.masterSku,
          quantity: item.adjustedQty,
          prepOwner: 'NONE' as const,
          labelOwner: 'SELLER' as const,  // Most FBA products require seller labeling (FNSKU)
        }))

        console.log(`[${id}] Creating inbound plan with ${items.length} items...`)
        console.log(`[${id}] Items:`, JSON.stringify(items))

        let planResult: { operationId: string; inboundPlanId: string }

        try {
          planResult = await createInboundPlan(
            marketplaceId,
            sourceAddress,
            items,
            contactInfo,
            `${shipment.internalId || `SHP-${id}`} - ${new Date().toISOString().split('T')[0]}`
          )
        } catch (apiError: any) {
          // Parse Amazon API error for helpful info
          const errorMessage = apiError.message || 'Unknown API error'

          // Extract "Accepted values: [...]" from error message
          const acceptedMatch = errorMessage.match(/Accepted values:\s*\[([^\]]+)\]/i)
          const acceptedValues = acceptedMatch ? acceptedMatch[1].split(',').map((v: string) => v.trim()) : null

          // Extract SKU from error message
          const skuMatch = errorMessage.match(/ERROR:\s*(\S+)\s+does not require/i)
          const problemSku = skuMatch ? skuMatch[1] : null

          await prisma.shipment.update({
            where: { id },
            data: {
              amazonWorkflowError: errorMessage,
            },
          })

          return NextResponse.json({
            error: 'Amazon rejected the inbound plan',
            details: errorMessage,
            problemSku,
            acceptedValues,
            hint: acceptedValues
              ? `Set prepOwner/labelOwner to one of: ${acceptedValues.join(', ')}`
              : 'Check the error details above',
            items: items.map(i => ({ msku: i.msku, prepOwner: i.prepOwner, labelOwner: i.labelOwner })),
          }, { status: 400 })
        }

        // Wait for plan creation to complete
        const planStatus = await waitForOperation(
          await createSpApiClient(),
          planResult.operationId
        )

        if (planStatus.operationStatus === 'FAILED') {
          const errorMsg = planStatus.operationProblems
            ?.map(p => `${p.code}: ${p.message}`)
            .join('; ') || 'Unknown error'

          await prisma.shipment.update({
            where: { id },
            data: {
              amazonWorkflowError: errorMsg,
              amazonLastOperationId: planResult.operationId,
            },
          })

          return NextResponse.json({
            error: 'Failed to create inbound plan',
            details: errorMsg,
            operationId: planResult.operationId,
            problems: planStatus.operationProblems,
          }, { status: 500 })
        }

        // Save plan ID
        await prisma.shipment.update({
          where: { id },
          data: {
            amazonInboundPlanId: planResult.inboundPlanId,
            amazonWorkflowStep: 'plan_created',
            amazonLastOperationId: planResult.operationId,
            amazonWorkflowError: null,
          },
        })

        result.inboundPlanId = planResult.inboundPlanId
        result.planOperationId = planResult.operationId
        console.log(`[${id}] Inbound plan created: ${planResult.inboundPlanId}`)
      }

      if (step === 'create_plan') {
        return NextResponse.json({
          success: true,
          step: 'create_plan',
          ...result,
          duration: Date.now() - startTime,
        })
      }
    }

    const inboundPlanId = result.inboundPlanId || shipment.amazonInboundPlanId
    if (!inboundPlanId) {
      return NextResponse.json({ error: 'No inbound plan ID' }, { status: 400 })
    }

    // ========================================
    // STEP 2: Packing Options & Information
    // ========================================
    if (step === 'all' || step === 'set_packing') {
      if (shipment.amazonWorkflowStep === 'packing_set' && step !== 'set_packing') {
        // Already done, skip
      } else {
        // Step 2a: Generate packing options
        console.log(`[${id}] Generating packing options...`)
        const genPackingResult = await generatePackingOptions(inboundPlanId)

        const genPackingStatus = await waitForOperation(
          await createSpApiClient(),
          genPackingResult.operationId
        )

        if (genPackingStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to generate packing options',
            details: genPackingStatus.operationProblems,
          }, { status: 500 })
        }

        // Step 2b: List packing options to get packingGroupId
        const { packingOptions } = await listPackingOptions(inboundPlanId)
        console.log(`[${id}] Found ${packingOptions.length} packing options`)

        if (!packingOptions.length) {
          return NextResponse.json({
            error: 'No packing options available from Amazon',
          }, { status: 500 })
        }

        // Use first packing option and get all packing groups
        const selectedPackingOption = packingOptions[0]
        const packingGroups = selectedPackingOption.packingGroups || []
        console.log(`[${id}] Using packing option ${selectedPackingOption.packingOptionId} with ${packingGroups.length} groups`)

        // Step 2c: Confirm packing option
        const confirmPackingResult = await confirmPackingOption(
          inboundPlanId,
          selectedPackingOption.packingOptionId
        )

        const confirmPackingStatus = await waitForOperation(
          await createSpApiClient(),
          confirmPackingResult.operationId
        )

        if (confirmPackingStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to confirm packing option',
            details: confirmPackingStatus.operationProblems,
          }, { status: 500 })
        }

        // Step 2d: Set packing information for each packing group
        // Build boxes for each packing group
        const boxes: BoxInput[] = shipment.boxes.map(box => ({
          weight: {
            unit: 'LB' as const,
            value: Number(box.weightLbs),
          },
          dimensions: {
            unitOfMeasurement: 'IN' as const,
            length: Number(box.lengthInches),
            width: Number(box.widthInches),
            height: Number(box.heightInches),
          },
          quantity: 1,
          contentInformationSource: 'BOX_CONTENT_PROVIDED' as const,
          items: box.items.map(item => ({
            msku: item.masterSku,
            quantity: item.quantity,
            prepOwner: 'NONE' as const,
            labelOwner: 'SELLER' as const,
          })),
        }))

        // Create package groupings for each packing group
        const packageGroupings = packingGroups.map(group => ({
          packingGroupId: group.packingGroupId,
          boxes: boxes,  // All boxes go to each group for now
        }))

        console.log(`[${id}] Setting packing info with ${boxes.length} boxes across ${packageGroupings.length} groups...`)

        const packingResult = await setPackingInformation(inboundPlanId, {
          packageGroupings,
        })

        // Wait for packing to complete
        const packingStatus = await waitForOperation(
          await createSpApiClient(),
          packingResult.operationId
        )

        if (packingStatus.operationStatus === 'FAILED') {
          const errorMsg = packingStatus.operationProblems
            ?.map(p => `${p.code}: ${p.message}`)
            .join('; ') || 'Unknown error'

          await prisma.shipment.update({
            where: { id },
            data: {
              amazonWorkflowError: errorMsg,
              amazonLastOperationId: packingResult.operationId,
            },
          })

          return NextResponse.json({
            error: 'Failed to set packing information',
            details: errorMsg,
            problems: packingStatus.operationProblems,
          }, { status: 500 })
        }

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonPackingOptionId: selectedPackingOption.packingOptionId,
          },
        })

        console.log(`[${id}] Packing information set successfully`)

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonWorkflowStep: 'packing_set',
            amazonLastOperationId: packingResult.operationId,
          },
        })

        result.packingOperationId = packingResult.operationId
        console.log(`[${id}] Packing info set`)
      }

      if (step === 'set_packing') {
        return NextResponse.json({
          success: true,
          step: 'set_packing',
          ...result,
          duration: Date.now() - startTime,
        })
      }
    }

    // ========================================
    // STEP 3: Generate and Confirm Placement
    // ========================================
    if (step === 'all' || step === 'confirm_placement') {
      if (shipment.amazonWorkflowStep === 'placement_confirmed' && step !== 'confirm_placement') {
        // Already done, skip
      } else {
        // Generate placement options
        console.log(`[${id}] Generating placement options...`)
        const genPlacementResult = await generatePlacementOptions(inboundPlanId)

        const genPlacementStatus = await waitForOperation(
          await createSpApiClient(),
          genPlacementResult.operationId
        )

        if (genPlacementStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to generate placement options',
            details: genPlacementStatus.operationProblems,
          }, { status: 500 })
        }

        // List placement options
        const { placementOptions } = await listPlacementOptions(inboundPlanId)
        console.log(`[${id}] Found ${placementOptions.length} placement options`)

        if (!placementOptions.length) {
          return NextResponse.json({
            error: 'No placement options available',
          }, { status: 500 })
        }

        // Find optimal placement (lowest fees)
        const optimalPlacement = findOptimalPlacementOption(placementOptions)
        if (!optimalPlacement) {
          return NextResponse.json({
            error: 'Could not find optimal placement option',
          }, { status: 500 })
        }

        console.log(`[${id}] Selected placement ${optimalPlacement.placementOptionId} with ${optimalPlacement.shipmentIds.length} shipments`)

        // Confirm placement
        const confirmResult = await confirmPlacementOption(
          inboundPlanId,
          optimalPlacement.placementOptionId
        )

        const confirmStatus = await waitForOperation(
          await createSpApiClient(),
          confirmResult.operationId
        )

        if (confirmStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to confirm placement option',
            details: confirmStatus.operationProblems,
          }, { status: 500 })
        }

        // Get shipment details and save splits
        const { shipments } = await listShipments(inboundPlanId)

        // Save shipment splits to database
        for (const split of shipments) {
          const splitDetail = await getShipment(inboundPlanId, split.shipmentId)

          await prisma.amazonShipmentSplit.create({
            data: {
              shipmentId: id,
              amazonShipmentId: split.shipmentId,
              amazonShipmentConfirmationId: splitDetail.shipmentConfirmationId || null,
              destinationFc: splitDetail.destination?.warehouseId || null,
              destinationAddress: splitDetail.destination?.address
                ? JSON.stringify(splitDetail.destination.address)
                : null,
              items: splitDetail.items ? JSON.stringify(splitDetail.items) : null,
              status: 'pending',
            },
          })
        }

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonWorkflowStep: 'placement_confirmed',
            amazonPlacementOptionId: optimalPlacement.placementOptionId,
            amazonShipmentSplits: JSON.stringify(
              shipments.map(s => ({
                shipmentId: s.shipmentId,
                shipmentConfirmationId: s.shipmentConfirmationId,
              }))
            ),
            amazonLastOperationId: confirmResult.operationId,
          },
        })

        result.placementOptionId = optimalPlacement.placementOptionId
        result.shipmentSplits = shipments.map(s => s.shipmentId)
        result.fees = optimalPlacement.fees
        console.log(`[${id}] Placement confirmed, ${shipments.length} shipment splits created`)
      }

      if (step === 'confirm_placement') {
        return NextResponse.json({
          success: true,
          step: 'confirm_placement',
          ...result,
          duration: Date.now() - startTime,
        })
      }
    }

    // ========================================
    // STEP 4: Generate and Confirm Transportation & Delivery Windows
    // ========================================
    if (step === 'all' || step === 'confirm_transport') {
      // Get all shipment splits
      const splits = await prisma.amazonShipmentSplit.findMany({
        where: { shipmentId: id },
      })

      if (!splits.length) {
        return NextResponse.json({
          error: 'No shipment splits found. Run confirm_placement first.',
        }, { status: 400 })
      }

      const placementOptionId = shipment.amazonPlacementOptionId
      const transportSelections: Array<{ shipmentId: string; transportationOptionId: string }> = []

      for (const split of splits) {
        if (split.status === 'transport_confirmed') continue

        console.log(`[${id}] Processing transport for split ${split.amazonShipmentId}...`)

        // Generate transportation options
        const genTransportResult = await generateTransportationOptions(
          inboundPlanId,
          split.amazonShipmentId,
          placementOptionId!
        )

        await waitForOperation(
          await createSpApiClient(),
          genTransportResult.operationId
        )

        // List transportation options
        const { transportationOptions } = await listTransportationOptions(
          inboundPlanId,
          split.amazonShipmentId,
          placementOptionId!
        )

        // Find SPD partnered carrier option
        const spdOption = findCheapestSpdOption(transportationOptions, split.amazonShipmentId)

        if (!spdOption) {
          console.warn(`[${id}] No SPD option available for ${split.amazonShipmentId}, checking for alternatives...`)
          // Could fall back to non-partnered or LTL here
          continue
        }

        // Generate delivery window options
        const genWindowResult = await generateDeliveryWindowOptions(
          inboundPlanId,
          split.amazonShipmentId
        )

        await waitForOperation(
          await createSpApiClient(),
          genWindowResult.operationId
        )

        // List delivery windows
        const { deliveryWindowOptions } = await listDeliveryWindowOptions(
          inboundPlanId,
          split.amazonShipmentId
        )

        const deliveryWindow = findEarliestDeliveryWindow(
          deliveryWindowOptions,
          split.amazonShipmentId
        )

        if (!deliveryWindow) {
          console.warn(`[${id}] No delivery window available for ${split.amazonShipmentId}`)
          continue
        }

        // Confirm delivery window
        const confirmWindowResult = await confirmDeliveryWindowOptions(
          inboundPlanId,
          split.amazonShipmentId,
          deliveryWindow.deliveryWindowOptionId
        )

        await waitForOperation(
          await createSpApiClient(),
          confirmWindowResult.operationId
        )

        // Update split with transport and delivery info
        await prisma.amazonShipmentSplit.update({
          where: { id: split.id },
          data: {
            transportationOptionId: spdOption.transportationOptionId,
            deliveryWindowOptionId: deliveryWindow.deliveryWindowOptionId,
            deliveryWindowStart: new Date(deliveryWindow.startDate),
            deliveryWindowEnd: new Date(deliveryWindow.endDate),
            carrier: spdOption.carrier?.name || 'Amazon Partnered Carrier',
          },
        })

        transportSelections.push({
          shipmentId: split.amazonShipmentId,
          transportationOptionId: spdOption.transportationOptionId,
        })

        console.log(`[${id}] Transport ${spdOption.transportationOptionId} and window ${deliveryWindow.deliveryWindowOptionId} selected for ${split.amazonShipmentId}`)
      }

      // Confirm all transportation options at once
      if (transportSelections.length > 0) {
        const confirmTransportResult = await confirmTransportationOptions(
          inboundPlanId,
          transportSelections
        )

        const transportStatus = await waitForOperation(
          await createSpApiClient(),
          confirmTransportResult.operationId
        )

        if (transportStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to confirm transportation options',
            details: transportStatus.operationProblems,
          }, { status: 500 })
        }

        // Mark all splits as transport confirmed
        await prisma.amazonShipmentSplit.updateMany({
          where: {
            shipmentId: id,
            amazonShipmentId: { in: transportSelections.map(t => t.shipmentId) },
          },
          data: { status: 'transport_confirmed' },
        })

        console.log(`[${id}] Transportation confirmed for ${transportSelections.length} shipments`)
      }

      // Update shipment status
      await prisma.shipment.update({
        where: { id },
        data: {
          amazonWorkflowStep: 'transport_confirmed',
          status: 'submitted',
          submittedAt: new Date(),
        },
      })

      result.transportSelections = transportSelections
    }

    // Return final result
    const finalShipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        amazonSplits: true,
      },
    })

    return NextResponse.json({
      success: true,
      step: step,
      shipment: {
        id: finalShipment?.id,
        internalId: finalShipment?.internalId,
        status: finalShipment?.status,
        amazonInboundPlanId: finalShipment?.amazonInboundPlanId,
        amazonWorkflowStep: finalShipment?.amazonWorkflowStep,
      },
      splits: finalShipment?.amazonSplits.map(s => ({
        amazonShipmentId: s.amazonShipmentId,
        destinationFc: s.destinationFc,
        status: s.status,
        carrier: s.carrier,
        deliveryWindow: s.deliveryWindowStart && s.deliveryWindowEnd
          ? `${s.deliveryWindowStart.toISOString().split('T')[0]} - ${s.deliveryWindowEnd.toISOString().split('T')[0]}`
          : null,
      })),
      duration: Date.now() - startTime,
    })
  } catch (error: any) {
    console.error('Error submitting to Amazon:', error)

    // Try to save error state
    try {
      const id = parseInt(params.id)
      if (!isNaN(id)) {
        await prisma.shipment.update({
          where: { id },
          data: {
            amazonWorkflowError: error.message || 'Unknown error',
          },
        })
      }
    } catch (e) {
      // Ignore save error
    }

    return NextResponse.json(
      {
        error: error.message || 'Failed to submit to Amazon',
        details: error.response?.data || error.stack,
      },
      { status: 500 }
    )
  }
}
