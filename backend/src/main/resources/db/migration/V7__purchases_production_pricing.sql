-- Markup over cost used to suggest sale prices; NULL falls back to pricing.markup.
ALTER TABLE categories ADD COLUMN markup NUMERIC(7,2) CHECK(markup>=0 AND markup<=1000);
INSERT INTO settings(id,value) VALUES ('pricing.markup','30'),('pricing.rounding','ends9') ON CONFLICT DO NOTHING;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
 CHECK(type IN ('IN','OUT','ADJUSTMENT','SALE','REVERSAL','LOSS','INTERNAL','PURCHASE','PRODUCTION'));
CREATE TABLE suppliers (id BIGSERIAL PRIMARY KEY, name VARCHAR(160) NOT NULL, document VARCHAR(30),
 phone VARCHAR(40), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE UNIQUE INDEX idx_suppliers_name ON suppliers(lower(name));
-- Goods received from a supplier document (invoice); one document per supplier.
CREATE TABLE purchases (id BIGSERIAL PRIMARY KEY, request_id UUID NOT NULL UNIQUE,
 supplier_id BIGINT NOT NULL REFERENCES suppliers, document VARCHAR(60) NOT NULL, due_date DATE NOT NULL,
 payment VARCHAR(5) NOT NULL CHECK(payment IN ('TERM','CASH')), total NUMERIC(14,2) NOT NULL CHECK(total>0),
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users, UNIQUE(supplier_id,document));
CREATE INDEX idx_purchases_date ON purchases(created_at);
CREATE TABLE purchase_items (id BIGSERIAL PRIMARY KEY, purchase_id BIGINT NOT NULL REFERENCES purchases,
 product_id BIGINT NOT NULL REFERENCES products, product_name VARCHAR(160) NOT NULL, unit VARCHAR(2) NOT NULL,
 quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0), unit_cost NUMERIC(14,4) NOT NULL CHECK(unit_cost>=0),
 total NUMERIC(14,2) NOT NULL, expires_on DATE, new_price NUMERIC(14,2));
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
-- Own production: a recipe turns inputs into a finished product (flour + oil -> bread).
CREATE TABLE recipes (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL UNIQUE REFERENCES products,
 yield NUMERIC(14,3) NOT NULL CHECK(yield>0), note VARCHAR(255) NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE recipe_items (id BIGSERIAL PRIMARY KEY, recipe_id BIGINT NOT NULL REFERENCES recipes,
 input_id BIGINT NOT NULL REFERENCES products, quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
 UNIQUE(recipe_id,input_id));
CREATE TABLE productions (id BIGSERIAL PRIMARY KEY, recipe_id BIGINT NOT NULL REFERENCES recipes,
 product_id BIGINT NOT NULL REFERENCES products, multiplier NUMERIC(10,3) NOT NULL CHECK(multiplier>0),
 produced NUMERIC(14,3) NOT NULL CHECK(produced>0), expires_on DATE NOT NULL,
 total_cost NUMERIC(14,2) NOT NULL, unit_cost NUMERIC(14,4) NOT NULL, note VARCHAR(255) NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users);
CREATE INDEX idx_productions_date ON productions(created_at);
CREATE TABLE production_inputs (id BIGSERIAL PRIMARY KEY, production_id BIGINT NOT NULL REFERENCES productions,
 product_id BIGINT NOT NULL REFERENCES products, product_name VARCHAR(160) NOT NULL, unit VARCHAR(2) NOT NULL,
 quantity NUMERIC(14,3) NOT NULL, unit_cost NUMERIC(14,2) NOT NULL);
CREATE INDEX idx_production_inputs_production ON production_inputs(production_id);
