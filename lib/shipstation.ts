/**
 * ShipStation API Client
 * Documentation: https://www.shipstation.com/docs/api/
 */

const SHIPSTATION_API_URL = 'https://ssapi.shipstation.com'

interface ShipStationConfig {
  apiKey: string
  apiSecret: string
}

interface Address {
  name: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
  residential?: boolean
}

interface CreateLabelRequest {
  carrierCode: string
  serviceCode: string
  packageCode: string
  shipDate: string
  weight: {
    value: number
    units: 'pounds' | 'ounces' | 'grams'
  }
  dimensions?: {
    length: number
    width: number
    height: number
    units: 'inches' | 'centimeters'
  }
  shipFrom: Address
  shipTo: Address
  testLabel?: boolean
}

interface LabelResponse {
  shipmentId: number
  shipmentCost: number
  insuranceCost: number
  trackingNumber: string
  labelData: string // Base64 encoded PDF
  formData: string | null
}

interface ShipmentStatus {
  shipmentId: number
  orderId: number
  orderKey: string
  orderNumber: string
  createDate: string
  shipDate: string
  shipmentCost: number
  insuranceCost: number
  trackingNumber: string
  isReturnLabel: boolean
  batchNumber: string | null
  carrierCode: string
  serviceCode: string
  packageCode: string
  confirmation: string
  warehouseId: number
  voided: boolean
  voidDate: string | null
  marketplaceNotified: boolean
  notifyErrorMessage: string | null
  shipTo: Address
  weight: {
    value: number
    units: string
  }
  dimensions: {
    length: number
    width: number
    height: number
    units: string
  } | null
  insuranceOptions: {
    provider: string
    insureShipment: boolean
    insuredValue: number
  }
  advancedOptions: object | null
  shipmentItems: Array<{
    orderItemId: number
    lineItemKey: string
    sku: string
    name: string
    imageUrl: string | null
    weight: { value: number; units: string } | null
    quantity: number
    unitPrice: number
    taxAmount: number | null
    shippingAmount: number | null
    warehouseLocation: string | null
    options: object[]
    productId: number | null
    fulfillmentSku: string | null
    adjustment: boolean
    upc: string | null
  }>
  labelData: string | null
  formData: string | null
}

interface CarrierService {
  carrierCode: string
  code: string
  name: string
  domestic: boolean
  international: boolean
}

interface RateRequest {
  carrierCode: string
  fromPostalCode: string
  toPostalCode: string
  toCountry: string
  weight: {
    value: number
    units: 'pounds' | 'ounces' | 'grams'
  }
  dimensions?: {
    length: number
    width: number
    height: number
    units: 'inches' | 'centimeters'
  }
}

interface Rate {
  serviceName: string
  serviceCode: string
  shipmentCost: number
  otherCost: number
}

export class ShipStationClient {
  private apiKey: string
  private apiSecret: string
  private baseUrl: string

  constructor(config?: ShipStationConfig) {
    this.apiKey = config?.apiKey || process.env.SHIPSTATION_API_KEY || ''
    this.apiSecret = config?.apiSecret || process.env.SHIPSTATION_API_SECRET || ''
    this.baseUrl = SHIPSTATION_API_URL

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[ShipStation] API credentials not configured')
    }
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')
    return `Basic ${credentials}`
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: object
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[ShipStation] API Error ${response.status}:`, errorText)
      throw new Error(`ShipStation API error: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  /**
   * Get available carriers
   */
  async getCarriers(): Promise<Array<{ name: string; code: string; accountNumber: string; requiresFundedAccount: boolean; balance: number }>> {
    return this.request('GET', '/carriers')
  }

  /**
   * Get services for a carrier
   */
  async getServices(carrierCode: string): Promise<CarrierService[]> {
    return this.request('GET', `/carriers/listservices?carrierCode=${carrierCode}`)
  }

  /**
   * Get shipping rates
   */
  async getRates(request: RateRequest): Promise<Rate[]> {
    return this.request('POST', '/shipments/getrates', request)
  }

  /**
   * Create a shipping label (used for return labels)
   */
  async createLabel(request: CreateLabelRequest): Promise<LabelResponse> {
    return this.request('POST', '/shipments/createlabel', request)
  }

  /**
   * Create a return label for a warranty claim
   * This swaps ship-from and ship-to addresses from the original order
   */
  async createReturnLabel(params: {
    customerAddress: Address
    warehouseAddress: Address
    weight?: { value: number; units: 'pounds' | 'ounces' }
    carrierCode?: string
    serviceCode?: string
    testLabel?: boolean
  }): Promise<LabelResponse> {
    const {
      customerAddress,
      warehouseAddress,
      weight = { value: 8, units: 'ounces' }, // Default weight for jewelry
      carrierCode = 'stamps_com', // USPS via Stamps.com
      serviceCode = 'usps_first_class_mail', // First Class is usually best for small items
      testLabel = false,
    } = params

    // For return label: customer ships TO warehouse
    const request: CreateLabelRequest = {
      carrierCode,
      serviceCode,
      packageCode: 'package',
      shipDate: new Date().toISOString().split('T')[0],
      weight,
      shipFrom: {
        ...customerAddress,
        country: customerAddress.country || 'US',
      },
      shipTo: {
        ...warehouseAddress,
        country: warehouseAddress.country || 'US',
      },
      testLabel,
    }

    return this.createLabel(request)
  }

  /**
   * Get shipment by ID
   */
  async getShipment(shipmentId: number): Promise<ShipmentStatus> {
    const response = await this.request<{ shipments: ShipmentStatus[] }>(
      'GET',
      `/shipments?shipmentId=${shipmentId}`
    )
    if (!response.shipments || response.shipments.length === 0) {
      throw new Error(`Shipment ${shipmentId} not found`)
    }
    return response.shipments[0]
  }

  /**
   * Void a label
   */
  async voidLabel(shipmentId: number): Promise<{ approved: boolean; message: string }> {
    return this.request('POST', '/shipments/voidlabel', { shipmentId })
  }

  /**
   * Get tracking info for a shipment
   */
  async getTracking(carrierCode: string, trackingNumber: string): Promise<{
    trackingNumber: string
    statusCode: string
    statusDescription: string
    carrierCode: string
    carrierName: string
    events: Array<{
      occurredAt: string
      carrierOccurredAt: string
      description: string
      city: string
      state: string
      postalCode: string
      country: string
    }>
  }> {
    // ShipStation doesn't have a direct tracking endpoint, but we can use carrier tracking
    // For now, return the tracking number - tracking should be looked up via carrier
    console.log(`[ShipStation] Tracking lookup for ${carrierCode}/${trackingNumber}`)
    throw new Error('Use carrier tracking API directly for detailed tracking')
  }

  /**
   * Register a webhook for tracking updates
   */
  async registerWebhook(params: {
    targetUrl: string
    event: 'SHIP_NOTIFY' | 'ITEM_ORDER_NOTIFY' | 'FULFILLMENT_SHIPPED' | 'ORDER_NOTIFY'
    storeId?: number
    name?: string
  }): Promise<{ id: number }> {
    return this.request('POST', '/webhooks/subscribe', {
      target_url: params.targetUrl,
      event: params.event,
      store_id: params.storeId,
      friendly_name: params.name,
    })
  }

  /**
   * List registered webhooks
   */
  async listWebhooks(): Promise<Array<{
    id: number
    name: string
    url: string
    event: string
    active: boolean
  }>> {
    const response = await this.request<{ webhooks: Array<{
      WebHookID: number
      Name: string
      Url: string
      HookType: string
      Active: boolean
    }> }>('GET', '/webhooks')
    
    return response.webhooks.map(w => ({
      id: w.WebHookID,
      name: w.Name,
      url: w.Url,
      event: w.HookType,
      active: w.Active,
    }))
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request('DELETE', `/webhooks/${webhookId}`)
  }

  /**
   * Check if credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret)
  }
}

// Export singleton instance
export const shipstation = new ShipStationClient()

// Export default warehouse address (should come from settings)
export function getWarehouseAddress(): Address {
  return {
    name: process.env.WAREHOUSE_NAME || 'CHOE Returns',
    company: process.env.WAREHOUSE_COMPANY || 'CHOE Jewelers',
    street1: process.env.WAREHOUSE_STREET1 || '',
    street2: process.env.WAREHOUSE_STREET2 || '',
    city: process.env.WAREHOUSE_CITY || '',
    state: process.env.WAREHOUSE_STATE || '',
    postalCode: process.env.WAREHOUSE_ZIP || '',
    country: 'US',
    phone: process.env.WAREHOUSE_PHONE || '',
  }
}

