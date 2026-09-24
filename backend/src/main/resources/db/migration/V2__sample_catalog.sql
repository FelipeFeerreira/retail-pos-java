INSERT INTO categories(name) VALUES ('Mercearia'),('Hortifruti'),('Bebidas'),('Limpeza'),('Laticínios');
INSERT INTO products(code,barcode,name,category_id,unit,price,cost,quantity,minimum_stock) VALUES
 ('001','7891000000011','Arroz branco 5 kg',1,'UN',24.90,19.00,48,10),
 ('002','7891000000028','Feijão carioca 1 kg',1,'UN',8.49,6.00,36,8),
 ('003','7891000000035','Leite integral 1 L',5,'UN',5.79,4.10,60,12),
 ('004',NULL,'Banana prata',2,'KG',6.99,3.50,25.500,5),
 ('005',NULL,'Tomate',2,'KG',8.90,4.20,18.750,5),
 ('006','7891000000066','Café torrado 500 g',1,'UN',18.90,13.00,20,6),
 ('007','7891000000073','Água mineral 500 ml',3,'UN',2.50,1.00,96,24),
 ('008','7891000000080','Detergente neutro 500 ml',4,'UN',2.99,1.70,4,8);
INSERT INTO customers(name,phone,credit_limit) VALUES ('Cliente exemplo','(11) 99999-0000',300);
INSERT INTO settings(id,value) VALUES ('store.name','Meu Mercadinho'),('store.address','Configure o endereço em Ajustes'),
 ('fee.CREDIT','2.50'),('fee.DEBIT','1.20'),('fee.PIX','0'),('fee.VOUCHER','3.00'),('fee.CASH','0'),('fee.ACCOUNT','0');
