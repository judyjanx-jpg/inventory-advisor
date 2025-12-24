import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createInboundPlan,
  generatePackingOptions,
  listPackingOptions,
  listPackingGroupItems,
  confirmPackingOption,
  setPackingInformation,
  generatePlacementOptions,
  listPlacementOptions,
  confirmPlacementOption,
  getShipment,
  generateTransportationOptions,
  listTransportationOptions,
  generateDeliveryWindowOptions,
  listDeliveryWindowOptions,
  confirmDeliveryWindowOptions,
  confirmTransportationOptions,
  getLabels,
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
 *
 * INTERACTIVE WORKFLOW (recommended):
 * - step: 'get_placement_options' - Create plan + packing, return placement options for user selection
 * - step: 'select_placement' - Confirm user's placement choice, return transport options with costs
 * - step: 'confirm_transport' - Confirm transport, get labels and shipment IDs
 *
 * AUTOMATIC WORKFLOW (legacy):
 * - step: 'all' (default) - Auto-select optimal placement and cheapest transport
 * - step: 'create_plan' | 'set_packing' | 'confirm_placement' | 'confirm_transport' - Individual steps
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

    // Parse request body once (can only be read once)
    let requestBody: any = {}
    try {
      requestBody = await request.json()
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Extract item settings (prep/label overrides)
    const itemSettings: Record<string, { prepOwner: string; labelOwner: string }> = requestBody.itemSettings || {}

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
      boxes: shipment.boxes?.map((b: { id: number; boxNumber: number; items?: unknown[] }) => ({
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
      const boxTotal = shipment.boxes.reduce((sum: number, box: { items: Array<{ masterSku: string; quantity: number }> }) => {
        const boxItem = box.items.find((bi: { masterSku: string }) => bi.masterSku === item.masterSku)
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

    // Use the already-parsed request body for interactive steps
    // (requestBody was parsed once at the beginning of the function)
    const body = requestBody

    // Build items list for Amazon (reused by multiple steps)
    const buildInboundItems = () => shipment.items.map((item: { masterSku: string; adjustedQty: number; product?: { prepOwner?: string; labelOwner?: string } }) => ({
      msku: item.masterSku,
      quantity: item.adjustedQty,
      prepOwner: (item.product?.prepOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE',
      labelOwner: (item.product?.labelOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE',
    }))

    // ========================================
    // INTERACTIVE STEP: Get Placement Options
    // Creates plan + packing, returns placement options for user selection
    // ========================================
    if (step === 'get_placement_options') {
      // Check if transport is already confirmed - shipment is complete
      if (shipment.amazonWorkflowStep === 'transport_confirmed') {
        // Get existing shipment splits to show
        const existingSplits = await prisma.amazonShipmentSplit.findMany({
          where: { shipmentId: id },
        })

        return NextResponse.json({
          success: true,
          step: 'get_placement_options',
          alreadySubmitted: true,
          inboundPlanId: shipment.amazonInboundPlanId,
          shipments: existingSplits.map(s => ({
            amazonShipmentId: s.amazonShipmentId,
            amazonShipmentConfirmationId: s.amazonShipmentConfirmationId,
            destinationFc: s.destinationFc,
            carrier: s.carrier,
            deliveryWindow: s.deliveryWindowStart && s.deliveryWindowEnd
              ? `${s.deliveryWindowStart.toISOString().split('T')[0]} - ${s.deliveryWindowEnd.toISOString().split('T')[0]}`
              : null,
            labelUrl: s.labelUrl,
          })),
          message: 'Shipment already submitted to Amazon.',
          duration: Date.now() - startTime,
        })
      }

      // Check if placement is already confirmed - need to resume from transport step
      if (shipment.amazonWorkflowStep === 'placement_confirmed') {
        const inboundPlanId = shipment.amazonInboundPlanId
        let placementOptionId = shipment.amazonPlacementOptionId

        if (!inboundPlanId) {
          return NextResponse.json({
            error: 'Shipment has inconsistent state - placement confirmed but missing inbound plan ID',
          }, { status: 400 })
        }

        // If placementOptionId is missing, try to retrieve it from Amazon
        if (!placementOptionId) {
          console.log(`[${id}] Missing placementOptionId, retrieving from Amazon...`)
          const { placementOptions } = await listPlacementOptions(inboundPlanId)

          // Find the confirmed/accepted placement option
          const confirmedPlacement = placementOptions.find(
            (p: any) => p.status === 'ACCEPTED' || p.status === 'CONFIRMED'
          )

          if (confirmedPlacement) {
            placementOptionId = confirmedPlacement.placementOptionId
            console.log(`[${id}] Found confirmed placement option: ${placementOptionId}`)

            // Save it to the database for future use
            await prisma.shipment.update({
              where: { id },
              data: { amazonPlacementOptionId: placementOptionId },
            })
          } else {
            // No confirmed placement found - this is an inconsistent state
            return NextResponse.json({
              error: 'Shipment marked as placement_confirmed but no confirmed placement found in Amazon',
              hint: 'The placement may have expired. Try creating a new shipment.',
            }, { status: 400 })
          }
        }

        // Return indicator that we should skip to transport selection
        return NextResponse.json({
          success: true,
          step: 'get_placement_options',
          skipToTransport: true,
          inboundPlanId,
          placementOptionId,
          message: 'Placement already confirmed. Proceeding to transport selection.',
          duration: Date.now() - startTime,
        })
      }

      // Step 1: Create or reuse inbound plan
      let inboundPlanId = shipment.amazonInboundPlanId

      if (!inboundPlanId) {
        const items = buildInboundItems()
        console.log(`[${id}] Creating inbound plan with ${items.length} items...`)

        const planResult = await createInboundPlan(
          marketplaceId,
          sourceAddress,
          items,
          contactInfo,
          `${shipment.internalId || `SHP-${id}`} - ${new Date().toISOString().split('T')[0]}`
        )

        const planStatus = await waitForOperation(
          await createSpApiClient(),
          planResult.operationId
        )

        if (planStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to create inbound plan',
            details: planStatus.operationProblems,
          }, { status: 500 })
        }

        inboundPlanId = planResult.inboundPlanId

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonInboundPlanId: inboundPlanId,
            amazonWorkflowStep: 'plan_created',
          },
        })

        console.log(`[${id}] Inbound plan created: ${inboundPlanId}`)
      }

      // Step 2: Set packing information if not already done
      if (shipment.amazonWorkflowStep !== 'packing_set' && shipment.amazonWorkflowStep !== 'placement_confirmed') {
        // Generate packing options
        console.log(`[${id}] Generating packing options...`)
        const genPackingResult = await generatePackingOptions(inboundPlanId)
        await waitForOperation(await createSpApiClient(), genPackingResult.operationId)

        // List and confirm first packing option
        const { packingOptions } = await listPackingOptions(inboundPlanId)
        if (!packingOptions.length) {
          return NextResponse.json({ error: 'No packing options available' }, { status: 500 })
        }

        const selectedPackingOption = packingOptions[0]
        const rawPackingGroups = selectedPackingOption.packingGroups || []
        const packingGroups = rawPackingGroups.map((pg: any) =>
          typeof pg === 'string' ? { packingGroupId: pg } : pg
        )

        // Confirm packing option
        const confirmPackingResult = await confirmPackingOption(inboundPlanId, selectedPackingOption.packingOptionId)
        await waitForOperation(await createSpApiClient(), confirmPackingResult.operationId)

        // Get items per packing group
        const packingGroupItemsMap = new Map<string, Set<string>>()
        for (const group of packingGroups) {
          const { items } = await listPackingGroupItems(inboundPlanId, group.packingGroupId)
          packingGroupItemsMap.set(group.packingGroupId, new Set(items.map(i => i.msku)))
        }

        // Build boxes
        // Create a lookup map from SKU to product prepOwner/labelOwner
        const productSettingsMap = new Map<string, { prepOwner: string; labelOwner: string }>()
        for (const item of shipment.items) {
          productSettingsMap.set(item.masterSku, {
            prepOwner: item.product?.prepOwner || 'NONE',
            labelOwner: item.product?.labelOwner || 'NONE',
          })
        }

        type ShipmentBox = typeof shipment.boxes[number]
        type BoxItem = ShipmentBox['items'][number]
        const allBoxes: BoxInput[] = shipment.boxes.map((box: ShipmentBox) => ({
          weight: { unit: 'LB' as const, value: Number(box.weightLbs) },
          dimensions: {
            unitOfMeasurement: 'IN' as const,
            length: Number(box.lengthInches),
            width: Number(box.widthInches),
            height: Number(box.heightInches),
          },
          quantity: 1,
          contentInformationSource: 'BOX_CONTENT_PROVIDED' as const,
          items: box.items.map((item: BoxItem) => {
            const productSettings = productSettingsMap.get(item.masterSku)
            return {
              msku: item.masterSku,
              quantity: item.quantity,
              prepOwner: (productSettings?.prepOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE',
              labelOwner: (productSettings?.labelOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE',
            }
          }),
        }))

        // Assign boxes to packing groups
        const packageGroupings: Array<{ packingGroupId: string; boxes: BoxInput[] }> = []
        for (const group of packingGroups) {
          const groupSkus = packingGroupItemsMap.get(group.packingGroupId) || new Set()
          const groupBoxes = allBoxes.filter(box => box.items.some(item => groupSkus.has(item.msku)))
          if (groupBoxes.length > 0) {
            packageGroupings.push({ packingGroupId: group.packingGroupId, boxes: groupBoxes })
          }
        }
        if (packageGroupings.length === 0) {
          packageGroupings.push({ packingGroupId: packingGroups[0].packingGroupId, boxes: allBoxes })
        }

        // Set packing information
        const packingResult = await setPackingInformation(inboundPlanId, { packageGroupings })
        const packingStatus = await waitForOperation(await createSpApiClient(), packingResult.operationId)

        if (packingStatus.operationStatus === 'FAILED') {
          return NextResponse.json({
            error: 'Failed to set packing information',
            details: packingStatus.operationProblems,
          }, { status: 500 })
        }

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonPackingOptionId: selectedPackingOption.packingOptionId,
            amazonWorkflowStep: 'packing_set',
          },
        })

        console.log(`[${id}] Packing information set`)
      }

      // Step 3: Generate placement options (but don't confirm yet)
      // First check if placement options already exist
      let placementOptions: any[] = []
      try {
        const existingOptions = await listPlacementOptions(inboundPlanId)
        placementOptions = existingOptions.placementOptions || []
        
        if (placementOptions.length > 0) {
          console.log(`[${id}] Found ${placementOptions.length} existing placement options, skipping generation`)
        } else {
          // No existing options, generate new ones
          console.log(`[${id}] No existing placement options found, generating new ones...`)
          const genPlacementResult = await generatePlacementOptions(inboundPlanId)
          await waitForOperation(await createSpApiClient(), genPlacementResult.operationId)
          
          // List the newly generated options
          const newOptions = await listPlacementOptions(inboundPlanId)
          placementOptions = newOptions.placementOptions || []
        }
      } catch (genError: any) {
        // Handle the case where placement options are already confirmed
        if (genError.message?.includes('placement option is already confirmed') || 
            genError.message?.includes('already confirmed') ||
            genError.message?.includes('Operation GeneratePlacementOptions cannot be processed')) {
          console.log(`[${id}] Placement option already confirmed, listing existing options...`)
          try {
            const existingOptions = await listPlacementOptions(inboundPlanId)
            placementOptions = existingOptions.placementOptions || []
            
            // Find the confirmed placement option
            const confirmedPlacement = placementOptions.find(
              (p: any) => p.status === 'ACCEPTED' || p.status === 'CONFIRMED'
            )
            
            if (confirmedPlacement && shipment.amazonPlacementOptionId !== confirmedPlacement.placementOptionId) {
              // Update database with the confirmed placement option
              await prisma.shipment.update({
                where: { id },
                data: {
                  amazonPlacementOptionId: confirmedPlacement.placementOptionId,
                  amazonWorkflowStep: 'placement_confirmed',
                },
              })
              
              // Return to transport selection since placement is already confirmed
              return NextResponse.json({
                success: true,
                step: 'get_placement_options',
                skipToTransport: true,
                inboundPlanId,
                placementOptionId: confirmedPlacement.placementOptionId,
                message: 'Placement already confirmed. Proceeding to transport selection.',
                duration: Date.now() - startTime,
              })
            }
          } catch (listError: any) {
            console.error(`[${id}] Error listing placement options:`, listError)
            return NextResponse.json({
              error: 'Failed to retrieve placement options',
              details: listError.message,
            }, { status: 500 })
          }
        } else {
          // Some other error occurred
          console.error(`[${id}] Error generating placement options:`, genError)
          return NextResponse.json({
            error: 'Failed to generate placement options',
            details: genError.message,
          }, { status: 500 })
        }
      }

      if (!placementOptions.length) {
        return NextResponse.json({ error: 'No placement options available' }, { status: 500 })
      }

      // Format placement options for UI
      const formattedOptions = placementOptions.map((opt: any) => ({
        placementOptionId: opt.placementOptionId,
        shipmentIds: opt.shipmentIds || [],
        status: opt.status,
        fees: opt.fees || [],
        discounts: opt.discounts || [],
        // Calculate total fee
        totalFee: (opt.fees || []).reduce((sum: number, fee: any) => {
          return sum + (fee.value?.amount || 0)
        }, 0),
        // FC destinations will be filled in next step after confirmation
      }))

      // Sort by total fee (cheapest first)
      formattedOptions.sort((a: any, b: any) => a.totalFee - b.totalFee)

      return NextResponse.json({
        success: true,
        step: 'get_placement_options',
        inboundPlanId,
        placementOptions: formattedOptions,
        recommendedOptionId: formattedOptions[0]?.placementOptionId,
        duration: Date.now() - startTime,
      })
    }

    // ========================================
    // INTERACTIVE STEP: Select Placement
    // Confirms user's placement choice, returns transport options with costs
    // ========================================
    if (step === 'select_placement') {
      const { placementOptionId } = body || {}

      if (!placementOptionId) {
        return NextResponse.json({
          error: 'placementOptionId is required in request body',
        }, { status: 400 })
      }

      const inboundPlanId = shipment.amazonInboundPlanId
      if (!inboundPlanId) {
        return NextResponse.json({
          error: 'No inbound plan found. Run get_placement_options first.',
        }, { status: 400 })
      }

      // Check if placement is already confirmed (resuming workflow)
      const placementAlreadyConfirmed = shipment.amazonWorkflowStep === 'placement_confirmed' ||
                                         shipment.amazonWorkflowStep === 'transport_confirmed'

      // Also check the actual placement option status from Amazon
      let placementOptionStatus: string | null = null
      try {
        const { placementOptions } = await listPlacementOptions(inboundPlanId)
        const selectedPlacement = placementOptions.find((p: any) => p.placementOptionId === placementOptionId)
        placementOptionStatus = selectedPlacement?.status || null
        
        if (selectedPlacement && (selectedPlacement.status === 'CONFIRMED' || selectedPlacement.status === 'ACCEPTED')) {
          console.log(`[${id}] Placement option ${placementOptionId} is already ${selectedPlacement.status} in Amazon`)
          // Update database if not already set
          if (!placementAlreadyConfirmed) {
            await prisma.shipment.update({
              where: { id },
              data: {
                amazonPlacementOptionId: placementOptionId,
                amazonWorkflowStep: 'placement_confirmed',
              },
            })
          }
        }
      } catch (listError: any) {
        console.warn(`[${id}] Could not check placement option status:`, listError.message)
      }

      const isPlacementConfirmed = placementAlreadyConfirmed || 
                                   placementOptionStatus === 'CONFIRMED' || 
                                   placementOptionStatus === 'ACCEPTED'

      if (!isPlacementConfirmed) {
        // Confirm the selected placement option
        console.log(`[${id}] Confirming placement option: ${placementOptionId}`)
        try {
          const confirmResult = await confirmPlacementOption(inboundPlanId, placementOptionId)
          const confirmStatus = await waitForOperation(await createSpApiClient(), confirmResult.operationId)

          if (confirmStatus.operationStatus === 'FAILED') {
            // Check if the error is because it's already confirmed
            const errorMsg = confirmStatus.operationProblems?.map((p: any) => p.message).join(' ') || ''
            if (errorMsg.includes('already confirmed') || errorMsg.includes('already confirmed')) {
              console.log(`[${id}] Placement already confirmed (detected from error), updating database`)
              await prisma.shipment.update({
                where: { id },
                data: {
                  amazonPlacementOptionId: placementOptionId,
                  amazonWorkflowStep: 'placement_confirmed',
                },
              })
              // Continue with the workflow
            } else {
              return NextResponse.json({
                error: 'Failed to confirm placement option',
                details: confirmStatus.operationProblems,
              }, { status: 500 })
            }
          }
        } catch (confirmError: any) {
          // Handle the case where confirmation fails because it's already confirmed
          if (confirmError.message?.includes('already confirmed') || 
              confirmError.message?.includes('Operation ConfirmPlacementOption cannot be processed')) {
            console.log(`[${id}] Placement option already confirmed (caught from error), updating database`)
            await prisma.shipment.update({
              where: { id },
              data: {
                amazonPlacementOptionId: placementOptionId,
                amazonWorkflowStep: 'placement_confirmed',
              },
            })
            // Continue with the workflow
          } else {
            throw confirmError
          }
        }
      } else {
        console.log(`[${id}] Placement already confirmed, skipping confirmation step`)
      }

      // Get the placement options to find shipment IDs
      const { placementOptions } = await listPlacementOptions(inboundPlanId)
      const selectedPlacement = placementOptions.find((p: any) => p.placementOptionId === placementOptionId)
      const shipmentIds = selectedPlacement?.shipmentIds || []

      // Save shipment splits
      const shipmentDetails: Array<{
        amazonShipmentId: string
        destinationFc: string | null
        transportationOptions: any[]
      }> = []

      for (const amazonShipmentId of shipmentIds) {
        // Get shipment details (destination FC)
        const splitDetail = await getShipment(inboundPlanId, amazonShipmentId)

        // Save to database (use amazonShipmentId as unique key since it's @unique in schema)
        await prisma.amazonShipmentSplit.upsert({
          where: {
            amazonShipmentId: amazonShipmentId,
          },
          update: {
            shipmentId: id, // Update shipmentId in case it changed
            destinationFc: splitDetail.destination?.warehouseId || null,
            destinationAddress: splitDetail.destination?.address
              ? JSON.stringify(splitDetail.destination.address)
              : null,
            items: splitDetail.items ? JSON.stringify(splitDetail.items) : null,
            status: 'pending',
          },
          create: {
            shipmentId: id,
            amazonShipmentId: amazonShipmentId,
            amazonShipmentConfirmationId: splitDetail.shipmentConfirmationId || null,
            destinationFc: splitDetail.destination?.warehouseId || null,
            destinationAddress: splitDetail.destination?.address
              ? JSON.stringify(splitDetail.destination.address)
              : null,
            items: splitDetail.items ? JSON.stringify(splitDetail.items) : null,
            status: 'pending',
          },
        })

        // Generate transportation options for this shipment
        console.log(`[${id}] Generating transport options for ${amazonShipmentId}...`)
        let transportationOptions: any[] = []
        
        try {
          const genTransportResult = await generateTransportationOptions(
            inboundPlanId,
            amazonShipmentId,
            placementOptionId
          )
          await waitForOperation(await createSpApiClient(), genTransportResult.operationId)

          // List transportation options
          const listResult = await listTransportationOptions(
            inboundPlanId,
            amazonShipmentId,
            placementOptionId
          )
          transportationOptions = listResult.transportationOptions || []
          console.log(`[${id}] Found ${transportationOptions.length} transportation options for ${amazonShipmentId}`)
        } catch (transportError: any) {
          console.error(`[${id}] Error generating/listing transportation options for ${amazonShipmentId}:`, transportError)
          // Continue with empty options - user can select later or use own carrier
          transportationOptions = []
          // Don't fail the entire step if transportation options can't be generated
          // The user can still proceed and select transportation options manually later
        }

        shipmentDetails.push({
          amazonShipmentId,
          destinationFc: splitDetail.destination?.warehouseId || null,
          transportationOptions: transportationOptions.map((opt: any) => ({
            transportationOptionId: opt.transportationOptionId,
            shippingMode: opt.shippingMode,
            shippingSolution: opt.shippingSolution,
            carrier: opt.carrier,
            quote: opt.quote,
          })),
        })
      }

      // Update shipment
      await prisma.shipment.update({
        where: { id },
        data: {
          amazonPlacementOptionId: placementOptionId,
          amazonWorkflowStep: 'placement_confirmed',
          amazonShipmentSplits: JSON.stringify(shipmentDetails.map(s => ({
            shipmentId: s.amazonShipmentId,
          }))),
        },
      })

      console.log(`[${id}] Placement confirmed, ${shipmentDetails.length} shipment splits created`)

      return NextResponse.json({
        success: true,
        step: 'select_placement',
        inboundPlanId,
        placementOptionId,
        shipments: shipmentDetails,
        duration: Date.now() - startTime,
      })
    }

    // ========================================
    // INTERACTIVE STEP: Confirm Transport
    // Takes user's transport selections, confirms delivery windows, gets labels
    // ========================================
    if (step === 'confirm_transport_interactive') {
      const { transportSelections } = body as {
        transportSelections: Array<{ amazonShipmentId: string; transportationOptionId: string }>
      }

      if (!transportSelections || !Array.isArray(transportSelections) || transportSelections.length === 0) {
        return NextResponse.json({
          error: 'transportSelections array is required in request body',
          example: { transportSelections: [{ amazonShipmentId: 'SHIP123', transportationOptionId: 'TRANS456' }] },
        }, { status: 400 })
      }

      const inboundPlanId = shipment.amazonInboundPlanId
      const placementOptionId = shipment.amazonPlacementOptionId

      if (!inboundPlanId || !placementOptionId) {
        return NextResponse.json({
          error: 'No inbound plan or placement option found. Run get_placement_options and select_placement first.',
        }, { status: 400 })
      }

      console.log(`[${id}] Confirming transport for ${transportSelections.length} shipments...`)

      const confirmedShipments: Array<{
        amazonShipmentId: string
        amazonShipmentConfirmationId: string | null
        destinationFc: string | null
        carrier: string | null
        deliveryWindow: string | null
        labelUrl: string | null
      }> = []

      // Step 1: Generate and confirm delivery windows for each shipment
      for (const selection of transportSelections) {
        const { amazonShipmentId, transportationOptionId } = selection

        console.log(`[${id}] Processing ${amazonShipmentId}...`)

        // Generate delivery window options
        const genWindowResult = await generateDeliveryWindowOptions(
          inboundPlanId,
          amazonShipmentId
        )
        await waitForOperation(await createSpApiClient(), genWindowResult.operationId)

        // List delivery windows
        const { deliveryWindowOptions } = await listDeliveryWindowOptions(
          inboundPlanId,
          amazonShipmentId
        )

        const deliveryWindow = findEarliestDeliveryWindow(deliveryWindowOptions, amazonShipmentId)

        if (!deliveryWindow) {
          console.warn(`[${id}] No delivery window available for ${amazonShipmentId}`)
          return NextResponse.json({
            error: `No delivery window available for shipment ${amazonShipmentId}`,
          }, { status: 400 })
        }

        // Confirm delivery window
        const confirmWindowResult = await confirmDeliveryWindowOptions(
          inboundPlanId,
          amazonShipmentId,
          deliveryWindow.deliveryWindowOptionId
        )
        await waitForOperation(await createSpApiClient(), confirmWindowResult.operationId)

        // Update the split record
        await prisma.amazonShipmentSplit.update({
          where: {
            amazonShipmentId: amazonShipmentId,
          },
          data: {
            transportationOptionId: transportationOptionId,
            deliveryWindowOptionId: deliveryWindow.deliveryWindowOptionId,
            deliveryWindowStart: new Date(deliveryWindow.startDate),
            deliveryWindowEnd: new Date(deliveryWindow.endDate),
          },
        })

        console.log(`[${id}] Delivery window confirmed for ${amazonShipmentId}`)
      }

      // Step 2: Confirm all transportation options at once
      // Filter out invalid entries and map to the format expected by confirmTransportationOptions
      const validSelections = transportSelections.filter(
        s => s.amazonShipmentId && s.transportationOptionId && s.transportationOptionId.trim() !== ''
      )

      if (validSelections.length === 0) {
        console.error(`[${id}] No valid transportation selections found. Received:`, JSON.stringify(transportSelections))
        return NextResponse.json({
          error: 'No valid transportation selections to confirm. All selections must have both amazonShipmentId and transportationOptionId.',
        }, { status: 400 })
      }

      const mappedSelections = validSelections.map(s => ({
        shipmentId: s.amazonShipmentId,
        transportationOptionId: s.transportationOptionId,
      }))

      // Additional validation - should never happen after filtering, but safety check
      if (mappedSelections.length === 0) {
        return NextResponse.json({
          error: 'No transportation selections to confirm after validation',
        }, { status: 400 })
      }

      console.log(`[${id}] Validated ${validSelections.length} valid selections out of ${transportSelections.length} total`)

      console.log(`[${id}] Confirming ${mappedSelections.length} transportation selections...`)
      console.log(`[${id}] Mapped selections:`, JSON.stringify(mappedSelections, null, 2))
      
      const confirmTransportResult = await confirmTransportationOptions(
        inboundPlanId,
        mappedSelections
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

      console.log(`[${id}] Transportation confirmed, getting labels...`)

      // Step 3: Get labels and shipment details for each
      for (const selection of transportSelections) {
        const { amazonShipmentId } = selection

        // Get updated shipment details (to get confirmation ID)
        const shipmentDetail = await getShipment(inboundPlanId, amazonShipmentId)

        // Get shipping labels (use THERMAL for 4x6 thermal printers)
        let labelUrl: string | null = null
        try {
          const labelResult = await getLabels(
            inboundPlanId,
            amazonShipmentId,
            'PACKAGE_LABEL',
            'THERMAL' // Use THERMAL for 4x6 thermal label printers
          )
          labelUrl = labelResult.downloadUrl
          console.log(`[${id}] Labels retrieved for ${amazonShipmentId}`)
        } catch (labelError: any) {
          console.warn(`[${id}] Could not get labels for ${amazonShipmentId}: ${labelError.message}`)
        }

        // Get the split record for carrier info
        const split = await prisma.amazonShipmentSplit.findUnique({
          where: {
            amazonShipmentId: amazonShipmentId,
          },
        })

        // Update split with final info
        await prisma.amazonShipmentSplit.update({
          where: {
            amazonShipmentId: amazonShipmentId,
          },
          data: {
            status: 'transport_confirmed',
            amazonShipmentConfirmationId: shipmentDetail.shipmentConfirmationId || null,
            labelUrl: labelUrl,
          },
        })

        confirmedShipments.push({
          amazonShipmentId,
          amazonShipmentConfirmationId: shipmentDetail.shipmentConfirmationId || null,
          destinationFc: shipmentDetail.destination?.warehouseId || null,
          carrier: split?.carrier || 'Amazon Partnered Carrier',
          deliveryWindow: split?.deliveryWindowStart && split?.deliveryWindowEnd
            ? `${split.deliveryWindowStart.toISOString().split('T')[0]} - ${split.deliveryWindowEnd.toISOString().split('T')[0]}`
            : null,
          labelUrl,
        })
      }

      // Update main shipment status
      await prisma.shipment.update({
        where: { id },
        data: {
          amazonWorkflowStep: 'transport_confirmed',
          status: 'submitted',
          submittedAt: new Date(),
        },
      })

      console.log(`[${id}] FBA submission complete - ${confirmedShipments.length} shipments confirmed`)

      return NextResponse.json({
        success: true,
        step: 'confirm_transport_interactive',
        inboundPlanId,
        shipments: confirmedShipments,
        message: `Successfully submitted ${confirmedShipments.length} shipment(s) to Amazon`,
        duration: Date.now() - startTime,
      })
    }

    // ========================================
    // STEP 1: Create Inbound Plan
    // ========================================
    if (step === 'all' || step === 'create_plan') {
      if (shipment.amazonInboundPlanId && step !== 'create_plan') {
        // Plan already exists, skip to next step
        result.inboundPlanId = shipment.amazonInboundPlanId
      } else {
        // Build items list for Amazon
        // Use item-specific settings from request body, falling back to product settings or defaults
        const items: InboundItem[] = shipment.items.map((item: { masterSku: string; adjustedQty: number; product?: { prepOwner?: string; labelOwner?: string } }) => {
          // Priority: request body overrides > product settings > defaults
          const settings = itemSettings[item.masterSku]
          const prepOwner = (settings?.prepOwner || item.product?.prepOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE'
          const labelOwner = (settings?.labelOwner || item.product?.labelOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE'

          return {
            msku: item.masterSku,
            quantity: item.adjustedQty,
            prepOwner,
            labelOwner,
          }
        })

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
      } else if (shipment.amazonWorkflowStep === 'placement_confirmed') {
        // Placement already confirmed, skip packing step entirely
        console.log(`[${id}] Placement already confirmed (from DB), skipping packing step`)
      } else {
        // Step 2a: Generate packing options (may already be done from previous attempt)
        let packingAlreadyConfirmed = false
        let skipPackingStep = false

        try {
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
        } catch (genError: any) {
          // Check if packing is already confirmed from a previous attempt
          if (genError.message?.includes('packing option is already confirmed')) {
            console.log(`[${id}] Packing already confirmed from previous attempt`)
            packingAlreadyConfirmed = true
          } else if (genError.message?.includes('placement option is already confirmed')) {
            // Placement already confirmed means we're past the packing step entirely
            console.log(`[${id}] Placement already confirmed, skipping packing step entirely`)
            skipPackingStep = true
          } else {
            throw genError
          }
        }

        // If placement is already confirmed, skip rest of packing step
        if (!skipPackingStep) {
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
        console.log(`[${id}] Packing option response:`, JSON.stringify(selectedPackingOption, null, 2))

        // packingGroups might be array of strings or array of objects
        const rawPackingGroups = selectedPackingOption.packingGroups || []
        const packingGroups = rawPackingGroups.map((pg: any) =>
          typeof pg === 'string' ? { packingGroupId: pg } : pg
        )
        console.log(`[${id}] Using packing option ${selectedPackingOption.packingOptionId} with ${packingGroups.length} groups`)

        if (!packingGroups.length) {
          return NextResponse.json({
            error: 'No packing groups found in packing option',
          }, { status: 500 })
        }

        // Step 2c: Confirm packing option (skip if already confirmed)
        if (!packingAlreadyConfirmed) {
          console.log(`[${id}] Confirming packing option...`)
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
          console.log(`[${id}] Packing option confirmed`)
        } else {
          console.log(`[${id}] Packing already confirmed, skipping confirmation step`)
        }

        // Step 2d: Get items for each packing group to know which boxes go where
        const packingGroupItemsMap = new Map<string, Set<string>>()
        for (const group of packingGroups) {
          const { items } = await listPackingGroupItems(inboundPlanId, group.packingGroupId)
          packingGroupItemsMap.set(group.packingGroupId, new Set(items.map(i => i.msku)))
          console.log(`[${id}] Packing group ${group.packingGroupId} contains SKUs: ${items.map(i => i.msku).join(', ')}`)
        }

        // Step 2e: Build boxes and assign to correct packing groups
        // Create a lookup map from SKU to product prepOwner/labelOwner
        const productSettingsMap = new Map<string, { prepOwner: string; labelOwner: string }>()
        for (const item of shipment.items) {
          productSettingsMap.set(item.masterSku, {
            prepOwner: item.product?.prepOwner || 'NONE',
            labelOwner: item.product?.labelOwner || 'NONE',
          })
        }

        type ShipmentBox = typeof shipment.boxes[number]
        type BoxItem = ShipmentBox['items'][number]
        const allBoxes: BoxInput[] = shipment.boxes.map((box: ShipmentBox) => ({
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
          items: box.items.map((item: BoxItem) => {
            // Use item-specific settings from request body, falling back to product settings from DB
            const settings = itemSettings[item.masterSku]
            const productSettings = productSettingsMap.get(item.masterSku)
            const prepOwner = (settings?.prepOwner || productSettings?.prepOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE'
            const labelOwner = (settings?.labelOwner || productSettings?.labelOwner || 'NONE') as 'AMAZON' | 'SELLER' | 'NONE'

            return {
              msku: item.masterSku,
              quantity: item.quantity,
              prepOwner,
              labelOwner,
            }
          }),
        }))

        // Assign boxes to packing groups based on item SKUs
        const packageGroupings: Array<{ packingGroupId: string; boxes: BoxInput[] }> = []

        for (const group of packingGroups) {
          const groupSkus = packingGroupItemsMap.get(group.packingGroupId) || new Set()

          // Find boxes that contain items from this packing group
          const groupBoxes = allBoxes.filter(box =>
            box.items.some(item => groupSkus.has(item.msku))
          )

          if (groupBoxes.length > 0) {
            packageGroupings.push({
              packingGroupId: group.packingGroupId,
              boxes: groupBoxes,
            })
            console.log(`[${id}] Assigned ${groupBoxes.length} boxes to packing group ${group.packingGroupId}`)
          }
        }

        // If no boxes assigned (shouldn't happen), use first group with all boxes
        if (packageGroupings.length === 0) {
          console.log(`[${id}] No boxes matched packing groups, assigning all to first group`)
          packageGroupings.push({
            packingGroupId: packingGroups[0].packingGroupId,
            boxes: allBoxes,
          })
        }

        console.log(`[${id}] Setting packing info with ${allBoxes.length} boxes across ${packageGroupings.length} groups...`)

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

        console.log(`[${id}] Packing information set successfully`)

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonPackingOptionId: selectedPackingOption.packingOptionId,
            amazonWorkflowStep: 'packing_set',
            amazonLastOperationId: packingResult.operationId,
          },
        })

        result.packingOperationId = packingResult.operationId
        console.log(`[${id}] Packing complete`)
        } // end if (!skipPackingStep)
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
        // Generate placement options (may already be done from previous attempt)
        let placementAlreadyConfirmed = false

        // First check if placement options already exist
        try {
          const existingOptions = await listPlacementOptions(inboundPlanId)
          if (existingOptions.placementOptions && existingOptions.placementOptions.length > 0) {
            console.log(`[${id}] Found ${existingOptions.placementOptions.length} existing placement options, skipping generation`)
            // Check if any are already confirmed
            const confirmed = existingOptions.placementOptions.find(
              (p: any) => p.status === 'ACCEPTED' || p.status === 'CONFIRMED'
            )
            if (confirmed) {
              placementAlreadyConfirmed = true
            }
          } else {
            // No existing options, generate new ones
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
          }
        } catch (genError: any) {
          // Check if placement is already confirmed from a previous attempt
          if (genError.message?.includes('placement option is already confirmed') || 
              genError.message?.includes('already confirmed') ||
              genError.message?.includes('Operation GeneratePlacementOptions cannot be processed')) {
            console.log(`[${id}] Placement option already confirmed, skipping generation`)
            placementAlreadyConfirmed = true
          } else {
            // If it's a listPlacementOptions error, that's okay - we'll try to generate
            if (!genError.message?.includes('listPlacementOptions')) {
              throw genError
            }
          }
        }

        // List placement options
        const { placementOptions } = await listPlacementOptions(inboundPlanId)
        console.log(`[${id}] Found ${placementOptions.length} placement options`)

        if (!placementOptions.length) {
          return NextResponse.json({
            error: 'No placement options available',
          }, { status: 500 })
        }

        // Find optimal placement (lowest fees) or the already confirmed one
        const optimalPlacement = findOptimalPlacementOption(placementOptions)
        if (!optimalPlacement) {
          return NextResponse.json({
            error: 'Could not find optimal placement option',
          }, { status: 500 })
        }

        console.log(`[${id}] Selected placement ${optimalPlacement.placementOptionId} with ${optimalPlacement.shipmentIds.length} shipments`)

        // Confirm placement (skip if already confirmed)
        let lastOperationId: string | null = null

        // Double-check placement option status from Amazon
        const selectedPlacement = placementOptions.find(
          (p: any) => p.placementOptionId === optimalPlacement.placementOptionId
        )
        const isPlacementConfirmed = placementAlreadyConfirmed || 
                                     selectedPlacement?.status === 'CONFIRMED' || 
                                     selectedPlacement?.status === 'ACCEPTED'

        if (!isPlacementConfirmed) {
          try {
            const confirmResult = await confirmPlacementOption(
              inboundPlanId,
              optimalPlacement.placementOptionId
            )

            const confirmStatus = await waitForOperation(
              await createSpApiClient(),
              confirmResult.operationId
            )

            if (confirmStatus.operationStatus === 'FAILED') {
              // Check if the error is because it's already confirmed
              const errorMsg = confirmStatus.operationProblems?.map((p: any) => p.message).join(' ') || ''
              if (errorMsg.includes('already confirmed') || errorMsg.includes('Operation ConfirmPlacementOption cannot be processed')) {
                console.log(`[${id}] Placement already confirmed (detected from error), updating database`)
                placementAlreadyConfirmed = true
                // Continue with the workflow
              } else {
                return NextResponse.json({
                  error: 'Failed to confirm placement option',
                  details: confirmStatus.operationProblems,
                }, { status: 500 })
              }
            } else {
              lastOperationId = confirmResult.operationId
            }
          } catch (confirmError: any) {
            // Handle the case where confirmation fails because it's already confirmed
            if (confirmError.message?.includes('already confirmed') || 
                confirmError.message?.includes('Operation ConfirmPlacementOption cannot be processed')) {
              console.log(`[${id}] Placement option already confirmed (caught from error), updating database`)
              placementAlreadyConfirmed = true
              // Continue with the workflow
            } else {
              throw confirmError
            }
          }
        } else {
          console.log(`[${id}] Placement already confirmed, skipping confirmation step`)
        }

        // Get shipment details using shipmentIds from placement option
        const shipmentIds = optimalPlacement.shipmentIds || []
        console.log(`[${id}] Processing ${shipmentIds.length} shipments from placement option`)

        // Save shipment splits to database
        const shipmentDetails: Array<{ shipmentId: string; shipmentConfirmationId?: string }> = []
        for (const amazonShipmentId of shipmentIds) {
          const splitDetail = await getShipment(inboundPlanId, amazonShipmentId)

          await prisma.amazonShipmentSplit.create({
            data: {
              shipmentId: id,
              amazonShipmentId: amazonShipmentId,
              amazonShipmentConfirmationId: splitDetail.shipmentConfirmationId || null,
              destinationFc: splitDetail.destination?.warehouseId || null,
              destinationAddress: splitDetail.destination?.address
                ? JSON.stringify(splitDetail.destination.address)
                : null,
              items: splitDetail.items ? JSON.stringify(splitDetail.items) : null,
              status: 'pending',
            },
          })

          shipmentDetails.push({
            shipmentId: amazonShipmentId,
            shipmentConfirmationId: splitDetail.shipmentConfirmationId,
          })
        }

        await prisma.shipment.update({
          where: { id },
          data: {
            amazonWorkflowStep: 'placement_confirmed',
            amazonPlacementOptionId: optimalPlacement.placementOptionId,
            amazonShipmentSplits: JSON.stringify(shipmentDetails),
            amazonLastOperationId: lastOperationId,
          },
        })

        result.placementOptionId = optimalPlacement.placementOptionId
        result.shipmentSplits = shipmentIds
        result.fees = optimalPlacement.fees
        console.log(`[${id}] Placement confirmed, ${shipmentIds.length} shipment splits created`)
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

      // Get the placement option ID - use result from step 3 or fetch from DB
      let placementOptionId = result.placementOptionId || shipment.amazonPlacementOptionId

      // If still not found, re-fetch the shipment to get latest data
      if (!placementOptionId) {
        const refreshedShipment = await prisma.shipment.findUnique({
          where: { id },
          select: { amazonPlacementOptionId: true },
        })
        placementOptionId = refreshedShipment?.amazonPlacementOptionId
      }

      if (!placementOptionId) {
        return NextResponse.json({
          error: 'No placement option ID found. Run confirm_placement first.',
        }, { status: 400 })
      }

      console.log(`[${id}] Using placement option ID: ${placementOptionId}`)

      const transportSelections: Array<{ shipmentId: string; transportationOptionId: string }> = []

      // Check if all splits are already confirmed
      const unconfirmedSplits = splits.filter((s: { status: string }) => s.status !== 'transport_confirmed')
      if (unconfirmedSplits.length === 0) {
        console.log(`[${id}] All ${splits.length} splits already have transport confirmed, skipping transportation step`)
      } else {
        console.log(`[${id}] Processing ${unconfirmedSplits.length} unconfirmed splits out of ${splits.length} total`)

      for (const split of splits) {
        if (split.status === 'transport_confirmed') continue

        console.log(`[${id}] Processing transport for split ${split.amazonShipmentId}...`)

        // Generate transportation options
        const genTransportResult = await generateTransportationOptions(
          inboundPlanId,
          split.amazonShipmentId,
          placementOptionId
        )

        await waitForOperation(
          await createSpApiClient(),
          genTransportResult.operationId
        )

        // List transportation options
        const { transportationOptions } = await listTransportationOptions(
          inboundPlanId,
          split.amazonShipmentId,
          placementOptionId
        )

        if (!transportationOptions || transportationOptions.length === 0) {
          console.warn(`[${id}] No transportation options available for ${split.amazonShipmentId}`)
          continue
        }

        // Find SPD partnered carrier option first (preferred)
        let selectedTransport = findCheapestSpdOption(transportationOptions, split.amazonShipmentId)

        // If no SPD option, fall back to cheapest available option
        if (!selectedTransport) {
          console.warn(`[${id}] No SPD option available for ${split.amazonShipmentId}, using cheapest alternative...`)
          
          // Filter options for this shipment
          const shipmentOptions = transportationOptions.filter(
            opt => opt.shipmentId === split.amazonShipmentId
          )

          if (shipmentOptions.length === 0) {
            console.warn(`[${id}] No transportation options found for shipment ${split.amazonShipmentId}`)
            continue
          }

          // Sort by price (cheapest first) and use the first one
          selectedTransport = shipmentOptions.sort((a, b) => {
            const priceA = a.quote?.price?.amount || Infinity
            const priceB = b.quote?.price?.amount || Infinity
            return priceA - priceB
          })[0]

          if (!selectedTransport) {
            console.warn(`[${id}] Could not select any transportation option for ${split.amazonShipmentId}`)
            continue
          }
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
            transportationOptionId: selectedTransport.transportationOptionId,
            deliveryWindowOptionId: deliveryWindow.deliveryWindowOptionId,
            deliveryWindowStart: new Date(deliveryWindow.startDate),
            deliveryWindowEnd: new Date(deliveryWindow.endDate),
            carrier: selectedTransport.carrier?.name || selectedTransport.shippingSolution || 'Carrier',
          },
        })

        transportSelections.push({
          shipmentId: split.amazonShipmentId,
          transportationOptionId: selectedTransport.transportationOptionId,
        })

        console.log(`[${id}] Transport ${selectedTransport.transportationOptionId} (${selectedTransport.shippingMode || 'N/A'}, ${selectedTransport.shippingSolution || 'N/A'}) and window ${deliveryWindow.deliveryWindowOptionId} selected for ${split.amazonShipmentId}`)
      }

      // Confirm all transportation options at once
      if (transportSelections.length > 0) {
        // Validate we have valid selections
        const validSelections = transportSelections.filter(s => s.shipmentId && s.transportationOptionId)
        if (validSelections.length === 0) {
          return NextResponse.json({
            error: 'No valid transportation selections to confirm',
          }, { status: 400 })
        }

        const confirmTransportResult = await confirmTransportationOptions(
          inboundPlanId,
          validSelections
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
      } else if (unconfirmedSplits.length > 0) {
        // We had unconfirmed splits but no transport selections were made
        console.warn(`[${id}] No transportation options were available for any shipment`)
        return NextResponse.json({
          error: 'No transportation options available for any shipment.',
          hint: 'Please use the interactive workflow (step=get_placement_options) to manually select transportation options, or use your own carrier.',
        }, { status: 400 })
      }
      } // end else block for unconfirmedSplits > 0

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
      splits: finalShipment?.amazonSplits.map((s: { amazonShipmentId: string; destinationFc: string | null; status: string; carrier: string | null; deliveryWindowStart: Date | null; deliveryWindowEnd: Date | null }) => ({
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
