# 🎯 Inventory Advisor

AI-Powered Inventory Management System for Multi-Channel E-commerce

## Features

- **Multi-Channel Support**: Manage products across Amazon US/UK/CA, Walmart, Shopify, and more
- **SKU Mapping**: Track master SKUs with channel-specific variants
- **Profit Tracking**: Sellerboard-style profit analytics with detailed fee breakdown
- **Demand Forecasting**: AI-powered sales velocity and inventory forecasting
- **Purchase Order Management**: Complete PO workflow with supplier tracking
- **FBA Shipment Management**: Track shipments to Amazon fulfillment centers
- **AI Advisor**: Intelligent recommendations with approval system
- **Real-time Alerts**: Low stock, stockout, and other critical notifications

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with Lucide icons

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your database connection:
```
DATABASE_URL="postgresql://user:password@localhost:5432/inventory_advisor"
```

4. Generate Prisma client:
```bash
npm run db:generate
```

5. Push database schema:
```bash
npm run db:push
```

6. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── dashboard/         # Dashboard page
│   ├── products/          # Products management
│   ├── inventory/         # Inventory tracking
│   └── ...
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── layout/           # Layout components
├── lib/                  # Utilities and helpers
│   ├── api/              # API integrations
│   └── prisma.ts         # Prisma client
└── prisma/               # Database schema
    └── schema.prisma     # Prisma schema
```

## Database Schema

The application uses a comprehensive database schema covering:
- Products with multi-channel SKU mapping
- Suppliers and purchase orders
- Inventory levels (FBA and warehouse)
- Orders and sales history
- Amazon fees and profit tracking
- FBA shipments and reconciliation
- Forecasting and velocity calculations
- Alerts and notifications
- AI Advisor approval system

See `prisma/schema.prisma` for the complete schema.

## API Integrations

### Amazon SP-API
- Orders API
- FBA Inventory API
- Finances API
- Fulfillment Inbound API

### Linnworks API
- Warehouse inventory sync

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:studio` - Open Prisma Studio
- `npm run db:migrate` - Create database migration

## License

MIT

