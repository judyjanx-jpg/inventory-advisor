-- Add physicalProductGroupId column to products table
-- This allows linking products that share the same physical inventory
-- (e.g., same item sold as bracelet and anklet listings)

ALTER TABLE "products" 
ADD COLUMN IF NOT EXISTS "physical_product_group_id" TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS "idx_products_physical_product_group_id" 
ON "products"("physical_product_group_id");

-- Add comment to explain the field
COMMENT ON COLUMN "products"."physical_product_group_id" IS 
'Groups products that share the same physical inventory. Products with the same ID share warehouse inventory and purchasing velocity, but maintain separate FBA listings.';

