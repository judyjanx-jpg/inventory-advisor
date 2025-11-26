# 🚀 Inventory Advisor - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

1. Create a PostgreSQL database:
```sql
CREATE DATABASE inventory_advisor;
```

2. Copy `.env.example` to `.env` and update with your database credentials:
```
DATABASE_URL="postgresql://user:password@localhost:5432/inventory_advisor"
```

3. Generate Prisma Client:
```bash
npm run db:generate
```

4. Push the schema to your database:
```bash
npm run db:push
```

### 3. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Status

### ✅ Completed

- **Project Structure**: Next.js 14 with TypeScript, Tailwind CSS
- **Database Schema**: Complete Prisma schema with all tables from specification
- **Core Pages**: Dashboard, Products, Inventory, Purchase Orders, Setup Wizard
- **Layout Components**: Sidebar navigation, Main layout
- **UI Components**: Button, Card components
- **API Routes**: Products, Inventory, Dashboard stats, Purchase Orders
- **AI Advisor**: Basic chat interface (ready for AI integration)
- **Utilities**: Currency formatting, date formatting, utility functions

### 🚧 In Progress / Next Steps

1. **Authentication System**
   - User login/registration
   - Session management
   - Role-based access control

2. **Data Integration**
   - Connect pages to real database queries
   - Implement data fetching with React Query
   - Add loading and error states

3. **Amazon SP-API Integration**
   - Implement OAuth flow
   - Orders API integration
   - FBA Inventory API
   - Finances API
   - Fulfillment Inbound API

4. **Linnworks API Integration**
   - Warehouse inventory sync
   - Stock level updates

5. **Forecasting System**
   - Sales velocity calculations
   - Demand forecasting algorithms
   - Reorder recommendations

6. **AI Advisor Enhancement**
   - Connect to AI service (OpenAI, Anthropic, etc.)
   - Approval system for actions
   - Module builder functionality

7. **Additional Features**
   - FBA Shipment management UI
   - Profit tracking charts and analytics
   - Alerts and notifications system
   - Reports and exports

## Database Schema Overview

The application includes comprehensive database tables:

- **Products**: Master SKU management with all product details
- **SkuMapping**: Multi-channel SKU mapping (Amazon US/UK/CA, Walmart, etc.)
- **Suppliers**: Supplier management with payment tracking
- **InventoryLevels**: FBA and warehouse inventory tracking
- **ChannelInventory**: Per-channel inventory and velocity
- **Orders & OrderItems**: Sales history
- **AmazonFees**: Detailed fee breakdown
- **Returns**: Return tracking with disposition
- **PurchaseOrders**: Complete PO workflow
- **FbaShipments**: Shipment tracking with reconciliation
- **DailyProfit**: Profit tracking by product
- **SalesVelocity**: Velocity calculations
- **DemandForecast**: Forecasting data
- **Alerts**: Notification system
- **BusinessProfile**: Business configuration
- **ApiConnections**: API credential management
- **Workflows**: Automation workflows
- **Modules**: User-created modules
- **Users & AuditLog**: User management
- **PendingActions**: AI approval system
- And more...

## API Routes

- `GET /api/products` - List all products
- `POST /api/products` - Create product
- `GET /api/inventory` - Get inventory levels
- `PATCH /api/inventory` - Update inventory
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/purchase-orders` - List purchase orders
- `POST /api/purchase-orders` - Create purchase order

## Next Steps

1. **Set up your database** and run migrations
2. **Configure environment variables** for API integrations
3. **Add sample data** to test the application
4. **Implement authentication** for user management
5. **Connect to Amazon SP-API** for real data
6. **Build out remaining features** based on your priorities

## Need Help?

Refer to the specification document for detailed requirements and data models.

