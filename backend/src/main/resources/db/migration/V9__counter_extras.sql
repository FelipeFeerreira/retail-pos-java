-- Returnable bottles lent to customers: positive = customer took bottles, negative = returned.
CREATE TABLE bottle_movements (id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers,
 bottle_type VARCHAR(40) NOT NULL, quantity INTEGER NOT NULL CHECK(quantity<>0), note VARCHAR(255) NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL, user_id BIGINT NOT NULL REFERENCES users);
CREATE INDEX idx_bottle_movements_customer ON bottle_movements(customer_id,bottle_type);
-- Local calendar used to classify sales days: pay days of the month and municipal holidays.
INSERT INTO settings(id,value) VALUES ('calendar.payDays','5,15,20,30'),('calendar.localHolidays',''),
 ('bottle.types','Coca,Coca 600ml,Coca 1L,Coca 2L,Outro') ON CONFLICT DO NOTHING;
