-- Money accounts: CASH holds all physical cash (drawers and safe), BANK the bank account.
CREATE TABLE financial_accounts (id BIGSERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE,
 kind VARCHAR(4) NOT NULL CHECK(kind IN ('CASH','BANK')), opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
 checked BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE);
INSERT INTO financial_accounts(name,kind) VALUES ('Dinheiro (gaveta e cofre)','CASH'),('Banco','BANK');
CREATE TABLE ledger_entries (id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES financial_accounts,
 amount NUMERIC(14,2) NOT NULL CHECK(amount<>0), entry_date DATE NOT NULL, category VARCHAR(60) NOT NULL,
 description VARCHAR(255) NOT NULL, source VARCHAR(12) NOT NULL, reference VARCHAR(60) NOT NULL DEFAULT '',
 user_id BIGINT NOT NULL REFERENCES users, created_at TIMESTAMPTZ NOT NULL,
 reconciled BOOLEAN NOT NULL DEFAULT FALSE, reversal_of BIGINT UNIQUE REFERENCES ledger_entries);
CREATE INDEX idx_ledger_date ON ledger_entries(entry_date);
CREATE INDEX idx_ledger_source ON ledger_entries(source,reference);
-- Bills to pay (suppliers, rent, energy...), paid partially or in full.
CREATE TABLE payables (id BIGSERIAL PRIMARY KEY, supplier_id BIGINT NOT NULL REFERENCES suppliers,
 description VARCHAR(160) NOT NULL, category VARCHAR(60) NOT NULL, document VARCHAR(60) NOT NULL DEFAULT '',
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0), issued_on DATE NOT NULL, due_date DATE NOT NULL,
 competence DATE NOT NULL, purchase_id BIGINT UNIQUE REFERENCES purchases, cancelled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users);
CREATE INDEX idx_payables_due ON payables(due_date) WHERE cancelled=false;
CREATE TABLE payable_payments (id BIGSERIAL PRIMARY KEY, payable_id BIGINT NOT NULL REFERENCES payables,
 principal NUMERIC(14,2) NOT NULL CHECK(principal>0), charges NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(charges>=0),
 discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(discount>=0), paid_on DATE NOT NULL,
 account_id BIGINT NOT NULL REFERENCES financial_accounts, method VARCHAR(20) NOT NULL, receipt VARCHAR(120) NOT NULL DEFAULT '',
 entry_id BIGINT REFERENCES ledger_entries, request_id UUID NOT NULL UNIQUE, reversed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users);
CREATE INDEX idx_payable_payments_payable ON payable_payments(payable_id);
-- Card sales the acquirer still owes the store.
CREATE TABLE card_receivables (id BIGSERIAL PRIMARY KEY, sale_id BIGINT NOT NULL REFERENCES sales,
 method VARCHAR(12) NOT NULL, gross NUMERIC(14,2) NOT NULL, fee NUMERIC(14,2) NOT NULL, expected_on DATE NOT NULL,
 settled_on DATE, entry_id BIGINT REFERENCES ledger_entries, cancelled BOOLEAN NOT NULL DEFAULT FALSE);
CREATE INDEX idx_card_receivables_open ON card_receivables(expected_on) WHERE settled_on IS NULL AND cancelled=false;
CREATE TABLE bank_statement_lines (id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES financial_accounts,
 line_date DATE NOT NULL, description VARCHAR(255) NOT NULL, amount NUMERIC(14,2) NOT NULL,
 identifier VARCHAR(80) NOT NULL, entry_id BIGINT UNIQUE REFERENCES ledger_entries, UNIQUE(account_id,identifier));
-- Credit (fiado) policy: store defaults in settings, optional override per customer.
ALTER TABLE customers ADD COLUMN address VARCHAR(255), ADD COLUMN note VARCHAR(255),
 ADD COLUMN term_days INTEGER CHECK(term_days>=0), ADD COLUMN interest_day NUMERIC(6,3) CHECK(interest_day>=0),
 ADD COLUMN penalty_day NUMERIC(6,3) CHECK(penalty_day>=0);
ALTER TABLE credits ADD COLUMN interest_day NUMERIC(6,3) NOT NULL DEFAULT 0, ADD COLUMN penalty_day NUMERIC(6,3) NOT NULL DEFAULT 0,
 ADD COLUMN method VARCHAR(12), ADD COLUMN charges NUMERIC(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN cash_session_id BIGINT REFERENCES cash_sessions;
INSERT INTO settings(id,value) VALUES ('credit.termDays','30'),('credit.interestDay','0'),('credit.penaltyDay','0'),
 ('card.daysCREDIT','30'),('card.daysDEBIT','1'),('card.daysVOUCHER','30') ON CONFLICT DO NOTHING;
