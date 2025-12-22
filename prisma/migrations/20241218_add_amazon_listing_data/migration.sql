-- AddAmazonListingData
-- Adds fields to store Amazon listing data (images, bullet points, descriptions)
-- for use in listing optimization tools and cross-channel conversion

-- Add main product image URL
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "main_image_url" TEXT;

-- Add additional images (JSON array of image URLs)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "additional_images" JSONB;

-- Add bullet points (JSON array of strings)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "bullet_points" JSONB;

-- Add full product description
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_description" TEXT;

-- Add raw Amazon attributes for AI tools
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "amazon_attributes" JSONB;
