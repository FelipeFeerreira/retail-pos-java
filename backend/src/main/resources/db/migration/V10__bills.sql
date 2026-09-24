-- Contas e Boletos: só acrescenta colunas; as contas existentes continuam iguais.
ALTER TABLE payables
 ADD COLUMN barcode VARCHAR(48),
 ADD COLUMN note VARCHAR(255) NOT NULL DEFAULT '',
 -- Contas geradas juntas (recorrência mensal ou parcelamento) compartilham a série.
 ADD COLUMN series_id UUID,
 ADD COLUMN series_kind VARCHAR(12) CHECK(series_kind IN ('MONTHLY','INSTALLMENTS')),
 ADD COLUMN installment INTEGER,
 ADD COLUMN installments INTEGER;
CREATE INDEX idx_payables_series ON payables(series_id);
