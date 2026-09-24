CREATE TABLE cash_sessions (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users,
 opened_at TIMESTAMPTZ NOT NULL, opening_amount NUMERIC(14,2) NOT NULL CHECK(opening_amount>=0),
 status VARCHAR(6) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
 closed_at TIMESTAMPTZ, closed_by BIGINT REFERENCES users, expected_cash NUMERIC(14,2), counted_cash NUMERIC(14,2) CHECK(counted_cash>=0),
 difference NUMERIC(14,2), notes VARCHAR(255),
 CHECK ((status='OPEN' AND closed_at IS NULL) OR (status='CLOSED' AND closed_at IS NOT NULL AND counted_cash IS NOT NULL)));
-- One open drawer per operator.
CREATE UNIQUE INDEX idx_cash_sessions_open_user ON cash_sessions(user_id) WHERE status='OPEN';
CREATE INDEX idx_cash_sessions_opened ON cash_sessions(opened_at);
CREATE TABLE cash_movements (id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL REFERENCES cash_sessions,
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users,
 type VARCHAR(10) NOT NULL CHECK(type IN ('WITHDRAWAL','SUPPLY')), amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
 reason VARCHAR(255) NOT NULL);
CREATE INDEX idx_cash_movements_session ON cash_movements(session_id);
ALTER TABLE sales ADD COLUMN cash_session_id BIGINT REFERENCES cash_sessions;
CREATE INDEX idx_sales_cash_session ON sales(cash_session_id);
