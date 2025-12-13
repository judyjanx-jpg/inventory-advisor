/**
 * FBA Inbound v2024-03-20 API Service
 *
 * Implements the Send-to-Amazon workflow for creating FBA shipments
 * with Optimal Placement and SPD (Small Parcel Delivery) support.
 *
 * Workflow:
 * 1. createInboundPlan - Create plan with SKUs
 * 2. setPackingInformation - Set box/carton details
 * 3. generatePlacementOptions + listPlacementOptions - Get FC splits
 * 4. confirmPlacementOption - Lock optimal placement (creates shipmentIds)
 * 5. generateTransportationOptions + listTransportationOptions - Get SPD options
 * 6. generateDeliveryWindowOptions + listDeliveryWindowOptions - Get windows
 * 7. confirmDeliveryWindowOptions - Lock delivery window
 * 8. confirmTransportationOptions - Lock SPD carrier
 * 9. getLabels - Download shipping labels
 */

import { createSpApiClient, MARKETPLACES } from './amazon-sp-api'

const API_VERSION = '2024-03-20'

// Types for the v2024 API
export interface InboundItem {
  msku: string
  quantity: number
  prepOwner: 'AMAZON' | 'SELLER' | 'NONE'
  labelOwner: 'AMAZON' | 'SELLER' | 'NONE'
  expiration?: string // YYYY-MM-DD for expirable items
  manufacturingLotCode?: string
}

export interface SourceAddress {
  name: string
  addressLine1: string
  addressLine2?: string
  city: string
  stateOrProvinceCode: string
  countryCode: string
  postalCode: string
  companyName?: string
  phoneNumber?: string  // Required by Amazon
}

export interface ContactInformation {
  name?: string
  email: string
  phoneNumber: string
}

export interface BoxContent {
  msku: string
  quantity: number
}

export interface BoxInput {
  weight: {
    unit: 'LB' | 'KG'
    value: number
  }
  dimensions: {
    unitOfMeasurement: 'IN' | 'CM'
    length: number
    width: number
    height: number
  }
  quantity: number // Number of boxes with this config
  contentInformationSource: 'BOX_CONTENT_PROVIDED' | 'BARCODE_2D'
  items: BoxContent[]
}

export interface PackingInput {
  packageGroupingInput: {
    boxConfigs: BoxInput[]
  }
}

export interface PlacementOption {
  placementOptionId: string
  fees: Array<{
    type: string
    target: string
    value: { amount: number; code: string }
  }>
  discounts: Array<{
    type: string
    target: string
    value: { amount: number; code: string }
  }>
  shipmentIds: string[]
  status: string
}

export interface TransportationOption {
  transportationOptionId: string
  shipmentId: string
  shippingMode: 'GROUND_SMALL_PARCEL' | 'FREIGHT_LTL' | 'FREIGHT_FTL'
  shippingSolution: 'AMAZON_PARTNERED_CARRIER' | 'USE_YOUR_OWN_CARRIER'
  carrier?: {
    alphaCode: string
    name: string
  }
  quote?: {
    price: { amount: number; code: string }
  }
}

export interface DeliveryWindowOption {
  deliveryWindowOptionId: string
  shipmentId: string
  startDate: string
  endDate: string
  availabilityType: string
}

export interface ShipmentSplit {
  shipmentId: string
  shipmentConfirmationId?: string
  /** Amazon shipment status: WORKING, READY_TO_SHIP, SHIPPED, IN_TRANSIT, DELIVERED, CHECKED_IN, RECEIVING, CLOSED, CANCELLED */
  status?: string
  trackingId?: string
  destination?: {
    address: {
      name: string
      addressLine1: string
      city: string
      stateOrProvinceCode: string
      countryCode: string
      postalCode: string
    }
    warehouseId?: string
  }
  items: Array<{ msku: string; quantity: number }>
}

export interface OperationStatus {
  operationId: string
  operationStatus: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
  operation: string
  operationProblems?: Array<{
    code: string
    message: string
    details?: string
    severity: 'ERROR' | 'WARNING'
  }>
}

// Helper to call the Fulfillment Inbound v2024 API
async function callFbaInboundApi(
  client: any,
  operation: string,
  params: {
    path?: Record<string, string>
    query?: Record<string, any>
    body?: any
  } = {}
): Promise<any> {
  return client.callAPI({
    operation,
    endpoint: 'fulfillmentInbound',
    options: { version: API_VERSION },
    path: params.path,
    query: params.query,
    body: params.body,
  })
}

// Poll operation status until complete
export async function waitForOperation(
  client: any,
  operationId: string,
  maxAttempts = 30,
  delayMs = 2000
): Promise<OperationStatus> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await callFbaInboundApi(client, 'getInboundOperationStatus', {
      path: { operationId },
    })

    if (status.operationStatus === 'SUCCESS' || status.operationStatus === 'FAILED') {
      return status
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  throw new Error(`Operation ${operationId} timed out after ${maxAttempts} attempts`)
}

/**
 * Step 1: Create an inbound plan
 */
export async function createInboundPlan(
  marketplaceId: string,
  sourceAddress: SourceAddress,
  items: InboundItem[],
  contactInfo: ContactInformation,
  planName?: string
): Promise<{ operationId: string; inboundPlanId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'createInboundPlan', {
    body: {
      destinationMarketplaces: [marketplaceId],
      sourceAddress,
      items,
      contactInformation: contactInfo,
      name: planName || `Inbound Plan ${new Date().toISOString().split('T')[0]}`,
    },
  })

  return {
    operationId: response.operationId,
    inboundPlanId: response.inboundPlanId,
  }
}

/**
 * Step 2: Set packing information (box contents)
 */
export async function setPackingInformation(
  inboundPlanId: string,
  packingInput: PackingInput
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'setPackingInformation', {
    path: { inboundPlanId },
    body: packingInput,
  })

  return { operationId: response.operationId }
}

/**
 * Step 3a: Generate placement options
 */
export async function generatePlacementOptions(
  inboundPlanId: string
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'generatePlacementOptions', {
    path: { inboundPlanId },
  })

  return { operationId: response.operationId }
}

/**
 * Step 3b: List placement options (after generate completes)
 */
export async function listPlacementOptions(
  inboundPlanId: string
): Promise<{ placementOptions: PlacementOption[]; pagination?: any }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'listPlacementOptions', {
    path: { inboundPlanId },
  })

  return {
    placementOptions: response.placementOptions || [],
    pagination: response.pagination,
  }
}

/**
 * Step 4: Confirm placement option (locks FC splits, creates shipmentIds)
 */
export async function confirmPlacementOption(
  inboundPlanId: string,
  placementOptionId: string
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'confirmPlacementOption', {
    path: { inboundPlanId, placementOptionId },
  })

  return { operationId: response.operationId }
}

/**
 * Get shipment details after placement confirmation
 */
export async function getShipment(
  inboundPlanId: string,
  shipmentId: string
): Promise<ShipmentSplit> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'getShipment', {
    path: { inboundPlanId, shipmentId },
  })

  return response
}

/**
 * List all shipments in an inbound plan
 */
export async function listShipments(
  inboundPlanId: string
): Promise<{ shipments: ShipmentSplit[] }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'listInboundPlanShipments', {
    path: { inboundPlanId },
  })

  return { shipments: response.shipments || [] }
}

/**
 * Step 5a: Generate transportation options
 */
export async function generateTransportationOptions(
  inboundPlanId: string,
  shipmentId: string,
  placementOptionId: string
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'generateTransportationOptions', {
    path: { inboundPlanId },
    body: {
      shipmentId,
      placementOptionId,
    },
  })

  return { operationId: response.operationId }
}

/**
 * Step 5b: List transportation options (for SPD, filter shippingMode)
 */
export async function listTransportationOptions(
  inboundPlanId: string,
  shipmentId?: string,
  placementOptionId?: string
): Promise<{ transportationOptions: TransportationOption[] }> {
  const client = await createSpApiClient()

  const query: Record<string, string> = {}
  if (shipmentId) query.shipmentId = shipmentId
  if (placementOptionId) query.placementOptionId = placementOptionId

  const response = await callFbaInboundApi(client, 'listTransportationOptions', {
    path: { inboundPlanId },
    query,
  })

  return { transportationOptions: response.transportationOptions || [] }
}

/**
 * Step 6a: Generate delivery window options
 */
export async function generateDeliveryWindowOptions(
  inboundPlanId: string,
  shipmentId: string
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'generateDeliveryWindowOptions', {
    path: { inboundPlanId, shipmentId },
  })

  return { operationId: response.operationId }
}

/**
 * Step 6b: List delivery window options
 */
export async function listDeliveryWindowOptions(
  inboundPlanId: string,
  shipmentId: string
): Promise<{ deliveryWindowOptions: DeliveryWindowOption[] }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'listDeliveryWindowOptions', {
    path: { inboundPlanId, shipmentId },
  })

  return { deliveryWindowOptions: response.deliveryWindowOptions || [] }
}

/**
 * Step 7: Confirm delivery window options
 */
export async function confirmDeliveryWindowOptions(
  inboundPlanId: string,
  shipmentId: string,
  deliveryWindowOptionId: string
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'confirmDeliveryWindowOptions', {
    path: { inboundPlanId, shipmentId },
    body: {
      deliveryWindowOptionId,
    },
  })

  return { operationId: response.operationId }
}

/**
 * Step 8: Confirm transportation options (for all shipments)
 */
export async function confirmTransportationOptions(
  inboundPlanId: string,
  transportationSelections: Array<{
    shipmentId: string
    transportationOptionId: string
  }>
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'confirmTransportationOptions', {
    path: { inboundPlanId },
    body: {
      transportationSelections,
    },
  })

  return { operationId: response.operationId }
}

/**
 * Step 9: Get shipping labels
 */
export async function getLabels(
  inboundPlanId: string,
  shipmentId: string,
  pageType: 'PACKAGE_LABEL' | 'BILL_OF_LADING' | 'PALLET_LABEL' = 'PACKAGE_LABEL',
  labelType: 'THERMAL' | 'PLAIN_PAPER' = 'PLAIN_PAPER',
  numberOfPackages?: number,
  packageIds?: string[]
): Promise<{ downloadUrl: string }> {
  const client = await createSpApiClient()

  const body: Record<string, any> = {
    pageType,
    labelType,
  }

  if (numberOfPackages) body.numberOfPackages = numberOfPackages
  if (packageIds?.length) body.packageIds = packageIds

  const response = await callFbaInboundApi(client, 'getLabels', {
    path: { inboundPlanId, shipmentId },
    body,
  })

  return { downloadUrl: response.downloadUrl }
}

/**
 * Cancel an inbound plan
 */
export async function cancelInboundPlan(
  inboundPlanId: string
): Promise<{ operationId: string }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'cancelInboundPlan', {
    path: { inboundPlanId },
  })

  return { operationId: response.operationId }
}

/**
 * Get inbound plan details
 */
export async function getInboundPlan(
  inboundPlanId: string
): Promise<any> {
  const client = await createSpApiClient()

  return callFbaInboundApi(client, 'getInboundPlan', {
    path: { inboundPlanId },
  })
}

/**
 * List all inbound plans
 */
export async function listInboundPlans(params?: {
  status?: string
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
  pageSize?: number
  paginationToken?: string
}): Promise<{ inboundPlans: any[]; pagination?: any }> {
  const client = await createSpApiClient()

  const response = await callFbaInboundApi(client, 'listInboundPlans', {
    query: params,
  })

  return {
    inboundPlans: response.inboundPlans || [],
    pagination: response.pagination,
  }
}

// ============================================
// High-level workflow helpers
// ============================================

/**
 * Find the optimal placement option (lowest fees, Amazon chooses FCs)
 * Optimal Placement = more FC splits but lower/zero fees
 */
export function findOptimalPlacementOption(
  placementOptions: PlacementOption[]
): PlacementOption | null {
  if (!placementOptions.length) return null

  // Sort by total fee (ascending) - optimal placement has lowest fees
  const sorted = [...placementOptions].sort((a, b) => {
    const feeA = a.fees.reduce((sum, f) => sum + (f.value?.amount || 0), 0)
    const feeB = b.fees.reduce((sum, f) => sum + (f.value?.amount || 0), 0)
    return feeA - feeB
  })

  return sorted[0]
}

/**
 * Find SPD partnered carrier transportation options
 */
export function filterSpdPartneredOptions(
  transportationOptions: TransportationOption[]
): TransportationOption[] {
  return transportationOptions.filter(
    opt =>
      opt.shippingMode === 'GROUND_SMALL_PARCEL' &&
      opt.shippingSolution === 'AMAZON_PARTNERED_CARRIER'
  )
}

/**
 * Find the cheapest SPD option for a shipment
 */
export function findCheapestSpdOption(
  transportationOptions: TransportationOption[],
  shipmentId: string
): TransportationOption | null {
  const spdOptions = transportationOptions.filter(
    opt =>
      opt.shipmentId === shipmentId &&
      opt.shippingMode === 'GROUND_SMALL_PARCEL' &&
      opt.shippingSolution === 'AMAZON_PARTNERED_CARRIER'
  )

  if (!spdOptions.length) return null

  return spdOptions.sort((a, b) => {
    const priceA = a.quote?.price?.amount || Infinity
    const priceB = b.quote?.price?.amount || Infinity
    return priceA - priceB
  })[0]
}

/**
 * Find the earliest available delivery window
 */
export function findEarliestDeliveryWindow(
  deliveryWindowOptions: DeliveryWindowOption[],
  shipmentId: string
): DeliveryWindowOption | null {
  const options = deliveryWindowOptions.filter(
    opt => opt.shipmentId === shipmentId && opt.availabilityType === 'AVAILABLE'
  )

  if (!options.length) return null

  return options.sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  )[0]
}

// Export marketplace constants for convenience
export { MARKETPLACES }
