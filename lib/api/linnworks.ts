// Linnworks API integration
// This will be implemented with actual Linnworks API calls

export interface LinnworksCredentials {
  applicationId: string
  applicationSecret: string
  token: string
}

export class LinnworksAPI {
  private credentials: LinnworksCredentials

  constructor(credentials: LinnworksCredentials) {
    this.credentials = credentials
  }

  async getInventory() {
    // TODO: Implement Linnworks Inventory API call
    throw new Error('Not implemented')
  }

  async updateInventory(sku: string, quantity: number) {
    // TODO: Implement Linnworks Inventory Update API call
    throw new Error('Not implemented')
  }
}

