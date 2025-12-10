-- AddActualRevenueToOrderItems
-- Adds fields to track actual revenue from Financial Events API (settlement data)
-- This enables Sellerboard-level accuracy by using settlement charges as source of truth

-- Add actual_revenue column to order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "actual_revenue" DECIMAL(10, 2);

-- Add actual_revenue_posted_at column to order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "actual_revenue_posted_at" TIMESTAMP(3);

-- Create index for faster queries on items with actual revenue data
CREATE INDEX IF NOT EXISTS "order_items_actual_revenue_idx" ON "order_items"("actual_revenue") WHERE "actual_revenue" IS NOT NULL;
