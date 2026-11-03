-- 0039: preserve Shopify provenance fields for safe, repeatable catalogue imports.
ALTER TABLE products ADD COLUMN source_handle TEXT;
ALTER TABLE products ADD COLUMN vendor TEXT;
ALTER TABLE products ADD COLUMN source_tags TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_handle
  ON products(source_handle) WHERE source_handle IS NOT NULL;
