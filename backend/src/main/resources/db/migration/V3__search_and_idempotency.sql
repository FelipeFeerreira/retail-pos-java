ALTER TABLE sales ADD COLUMN request_hash VARCHAR(64);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING gin(lower(name) gin_trgm_ops) WHERE active=true;
CREATE INDEX idx_customers_name_trgm ON customers USING gin(lower(name) gin_trgm_ops) WHERE active=true;
CREATE INDEX idx_products_expiry ON products(expires_on) WHERE active=true;
CREATE INDEX idx_payments_sale ON payments(sale_id);
CREATE INDEX idx_credits_sale ON credits(sale_id);
