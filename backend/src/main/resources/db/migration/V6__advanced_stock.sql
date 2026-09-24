ALTER TABLE products ADD COLUMN perishable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
 CHECK(type IN ('IN','OUT','ADJUSTMENT','SALE','REVERSAL','LOSS','INTERNAL'));
-- Expiry detail of the stock: the lot sum never exceeds products.quantity; stock outside lots is untracked.
CREATE TABLE stock_lots (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>=0), expires_on DATE, received_at TIMESTAMPTZ NOT NULL,
 note VARCHAR(255) NOT NULL DEFAULT '');
CREATE INDEX idx_stock_lots_open ON stock_lots(product_id,expires_on) WHERE quantity>0;
-- Which lots each exit consumed, so a cancelled sale can return goods to the same lots.
CREATE TABLE lot_consumptions (id BIGSERIAL PRIMARY KEY, lot_id BIGINT NOT NULL REFERENCES stock_lots,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0), source VARCHAR(12) NOT NULL, reference_id BIGINT,
 created_at TIMESTAMPTZ NOT NULL);
CREATE INDEX idx_lot_consumptions_ref ON lot_consumptions(source,reference_id);
-- Losses (thrown away) and internal consumption (used by the store/family), both at cost.
CREATE TABLE writeoffs (id BIGSERIAL PRIMARY KEY, kind VARCHAR(8) NOT NULL CHECK(kind IN ('LOSS','INTERNAL')),
 reason VARCHAR(80) NOT NULL, note VARCHAR(255) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL,
 user_id BIGINT NOT NULL REFERENCES users, total_cost NUMERIC(14,2) NOT NULL DEFAULT 0);
CREATE INDEX idx_writeoffs_kind_date ON writeoffs(kind,created_at);
CREATE TABLE writeoff_items (id BIGSERIAL PRIMARY KEY, writeoff_id BIGINT NOT NULL REFERENCES writeoffs,
 product_id BIGINT NOT NULL REFERENCES products, product_name VARCHAR(160) NOT NULL, unit VARCHAR(2) NOT NULL,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0), unit_cost NUMERIC(14,2) NOT NULL, total NUMERIC(14,2) NOT NULL);
CREATE INDEX idx_writeoff_items_writeoff ON writeoff_items(writeoff_id);
CREATE TABLE inventory_counts (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products,
 previous NUMERIC(14,3) NOT NULL, counted NUMERIC(14,3) NOT NULL, reason VARCHAR(255) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users);
CREATE INDEX idx_inventory_counts_date ON inventory_counts(created_at);
CREATE TABLE price_history (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products,
 previous NUMERIC(14,2) NOT NULL, current NUMERIC(14,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
 user_id BIGINT NOT NULL REFERENCES users);
CREATE INDEX idx_price_history_product ON price_history(product_id,created_at);
