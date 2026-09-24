CREATE TABLE categories (id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE);
CREATE TABLE products (
 id BIGSERIAL PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, code VARCHAR(50) NOT NULL UNIQUE,
 barcode VARCHAR(50) UNIQUE, name VARCHAR(160) NOT NULL, category_id BIGINT REFERENCES categories,
 unit VARCHAR(2) NOT NULL CHECK (unit IN ('UN','KG')), price NUMERIC(14,2) NOT NULL CHECK(price>=0),
 cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(cost>=0), quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(quantity>=0),
 minimum_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(minimum_stock>=0), expires_on DATE, active BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK (unit <> 'UN' OR quantity = trunc(quantity))
);
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL,
 role VARCHAR(10) NOT NULL CHECK(role IN ('ADMIN','MANAGER','CASHIER')), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE customers (id BIGSERIAL PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, name VARCHAR(160) NOT NULL,
 document VARCHAR(30) UNIQUE, phone VARCHAR(40), credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(credit_limit>=0),
 balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(balance>=0 AND balance<=credit_limit), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE sales (id BIGSERIAL PRIMARY KEY, request_id UUID NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL,
 user_id BIGINT NOT NULL REFERENCES users, customer_id BIGINT REFERENCES customers, total NUMERIC(14,2) NOT NULL CHECK(total>=0),
 fees NUMERIC(14,2) NOT NULL DEFAULT 0, status VARCHAR(10) NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED','CANCELLED')));
CREATE TABLE sale_items (id BIGSERIAL PRIMARY KEY, sale_id BIGINT NOT NULL REFERENCES sales, product_id BIGINT NOT NULL REFERENCES products,
 product_name VARCHAR(160) NOT NULL, unit VARCHAR(2) NOT NULL, quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
 unit_price NUMERIC(14,2) NOT NULL CHECK(unit_price>=0), cost NUMERIC(14,2) NOT NULL, discount NUMERIC(14,2) NOT NULL CHECK(discount>=0),
 total NUMERIC(14,2) NOT NULL CHECK(total>=0));
CREATE TABLE payments (id BIGSERIAL PRIMARY KEY, sale_id BIGINT NOT NULL REFERENCES sales,
 method VARCHAR(12) NOT NULL CHECK(method IN ('CASH','CREDIT','DEBIT','PIX','VOUCHER','ACCOUNT')),
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0), fee NUMERIC(14,2) NOT NULL DEFAULT 0);
CREATE TABLE stock_movements (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products,
 sale_id BIGINT REFERENCES sales, user_id BIGINT NOT NULL REFERENCES users, created_at TIMESTAMPTZ NOT NULL,
 type VARCHAR(12) NOT NULL CHECK(type IN ('IN','OUT','ADJUSTMENT','SALE','REVERSAL')),
 quantity NUMERIC(14,3) NOT NULL, reason VARCHAR(255) NOT NULL);
CREATE TABLE credits (id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers,
 sale_id BIGINT REFERENCES sales, created_at TIMESTAMPTZ NOT NULL, due_date DATE,
 amount NUMERIC(14,2) NOT NULL CHECK(amount<>0), remaining NUMERIC(14,2) NOT NULL CHECK(remaining>=0),
 description VARCHAR(255) NOT NULL, user_id BIGINT NOT NULL REFERENCES users);
CREATE TABLE price_rules (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products,
 table_name VARCHAR(50) NOT NULL DEFAULT 'RETAIL', price NUMERIC(14,2) NOT NULL CHECK(price>=0),
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, CHECK(ends_at>starts_at));
CREATE TABLE settings (id VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE printers (id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, connection VARCHAR(20) NOT NULL, address VARCHAR(255) NOT NULL);
CREATE TABLE scales (id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, port VARCHAR(100) NOT NULL, protocol VARCHAR(50) NOT NULL);
CREATE TABLE audit_log (id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, actor VARCHAR(80) NOT NULL,
 action VARCHAR(80) NOT NULL, entity VARCHAR(80) NOT NULL, entity_id VARCHAR(80), details TEXT NOT NULL);
CREATE INDEX idx_products_name ON products(lower(name));
CREATE INDEX idx_sales_created ON sales(created_at);
CREATE INDEX idx_items_sale ON sale_items(sale_id);
CREATE INDEX idx_stock_product_date ON stock_movements(product_id,created_at);
CREATE INDEX idx_credits_customer_due ON credits(customer_id,due_date) WHERE remaining>0;
CREATE INDEX idx_rules_product ON price_rules(product_id,table_name,starts_at DESC);
CREATE INDEX idx_audit_created ON audit_log(created_at);
