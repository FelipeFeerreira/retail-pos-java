// Imports the Python system's SQLite database (mercadinho.db) into this PostgreSQL database.
// Usage: node scripts/import-python.mjs <path/to/mercadinho.db> [--config <config.json>] [--apply]
// Without --apply it only prints the summary checks. With --apply it takes a pg_dump backup,
// then replaces the business data in a single transaction (all or nothing). Users, financial
// accounts and store settings other than name and fees are kept.
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith("--") && a.endsWith(".db"));
if (!dbPath) {
  console.error("Uso: node scripts/import-python.mjs <mercadinho.db> [--config config.json] [--apply]");
  process.exit(1);
}
const configPath = args.includes("--config")
  ? args[args.indexOf("--config") + 1]
  : path.join(path.dirname(dbPath), "config.json");
const apply = args.includes("--apply");
const src = new DatabaseSync(dbPath, { readOnly: true });
const all = (sql) => src.prepare(sql).all();

const lit = (v) => (v === null || v === undefined ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
const money = (v) => (Math.round(Number(v || 0) * 100) / 100).toFixed(2);
const qty = (v) => (Math.round(Number(v || 0) * 1000) / 1000).toFixed(3);
const blank = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const ts = (v) => lit(String(v).replace(" ", "T") + "-03:00");
const day = (v) => String(v).slice(0, 10);
const addDays = (d, n) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const cents = (v) => Math.round(Number(v) * 100);

const sql = [];
const out = (s) => sql.push(s);
const ADMIN = "(SELECT id FROM users WHERE username='admin')";
const IMPORTED = "(sistema anterior)";

out("SET client_min_messages TO WARNING;");
out(
  "TRUNCATE TABLE bottle_movements,bank_statement_lines,card_receivables,payable_payments,payables," +
    "ledger_entries,production_inputs,productions,recipe_items,recipes,purchase_items,purchases,suppliers," +
    "lot_consumptions,stock_lots,writeoff_items,writeoffs,inventory_counts,price_history,cash_movements," +
    "cash_sessions,payments,sale_items,stock_movements,credits,price_rules,sales,products,customers," +
    "categories RESTART IDENTITY CASCADE;",
);

// Categories: blank ones become "no category"; case variants are merged under the most used spelling.
const categoryRows = all(
  "SELECT trim(categoria) name, count(*) n FROM produtos WHERE trim(coalesce(categoria,''))<>'' GROUP BY trim(categoria) ORDER BY n DESC",
);
const categoryIds = new Map();
let nextCategory = 1;
for (const row of categoryRows) {
  const key = row.name.toLowerCase();
  if (categoryIds.has(key)) continue;
  categoryIds.set(key, nextCategory);
  out(`INSERT INTO categories(id,name) VALUES (${nextCategory},${lit(row.name)});`);
  nextCategory++;
}

// Products keep their ids so sales, recipes and lots map directly.
const lots = all("SELECT * FROM lotes_validade WHERE quantidade>0");
const products = all("SELECT * FROM produtos ORDER BY id");
const productById = new Map(products.map((p) => [p.id, p]));
for (const p of products) {
  const category = blank(p.categoria) ? categoryIds.get(p.categoria.trim().toLowerCase()) : null;
  const unit = p.unidade === "KG" ? "KG" : "UN";
  const stock = unit === "UN" ? Math.max(0, Math.round(p.quantidade_estoque)) : Math.max(0, p.quantidade_estoque);
  const lot = lots.find((l) => l.produto_id === p.id);
  out(
    `INSERT INTO products(id,code,barcode,name,category_id,unit,price,cost,quantity,minimum_stock,expires_on,active,perishable) VALUES (` +
      [
        p.id,
        lit(blank(p.sku) || "INT-" + String(p.id).padStart(6, "0")),
        lit(blank(p.codigo_barras)),
        lit(String(p.nome).trim().slice(0, 160)),
        category ?? "NULL",
        lit(unit),
        money(p.preco_venda),
        money(p.preco_custo),
        qty(stock),
        qty(Math.max(0, p.estoque_minimo || 0)),
        lot?.data_validade ? lit(lot.data_validade) : "NULL",
        p.ativo ? "true" : "false",
        p.perecivel ? "true" : "false",
      ].join(",") +
      ");",
  );
  if (stock > 0)
    out(
      `INSERT INTO stock_movements(product_id,user_id,created_at,type,quantity,reason) VALUES (${p.id},${ADMIN},now(),'ADJUSTMENT',${qty(stock)},'Saldo importado ${IMPORTED}');`,
    );
}
for (const l of lots) {
  const p = productById.get(l.produto_id);
  if (!p) continue;
  out(
    `INSERT INTO stock_lots(product_id,quantity,expires_on,received_at,note) VALUES (${l.produto_id},${qty(Math.min(l.quantidade, Math.max(0, p.quantidade_estoque)))},${lit(l.data_validade)},${ts(l.data_entrada)},${lit(blank(l.observacao) || "Lote importado")});`,
  );
}

// Fiado: sales on credit and negative "payments" (balance adjustments) are debts; positive
// payments settle the oldest debts first, so the balance matches the old system.
const sales = all("SELECT * FROM vendas ORDER BY id");
const debts = new Map();
const addDebt = (customer, debt) => {
  if (!debts.has(customer)) debts.set(customer, { debts: [], paid: 0, payments: [] });
  debts.get(customer).debts.push(debt);
};
for (const s of sales)
  if (s.forma_pagamento === "fiado" && !s.cancelada && s.cliente_id && cents(s.valor_total) > 0)
    addDebt(s.cliente_id, { sale: s.id, amount: cents(s.valor_total), at: s.data_hora, description: "Venda #" + s.id });
for (const p of all("SELECT * FROM pagamentos_fiado WHERE estornado=0 ORDER BY data_hora,id")) {
  if (!p.valor) continue;
  if (p.valor < 0)
    addDebt(p.cliente_id, {
      sale: null,
      amount: cents(-p.valor),
      at: p.data_hora,
      description: blank(p.observacao) || "Ajuste de saldo " + IMPORTED,
    });
  else {
    if (!debts.has(p.cliente_id)) debts.set(p.cliente_id, { debts: [], paid: 0, payments: [] });
    const entry = debts.get(p.cliente_id);
    entry.paid += cents(p.valor);
    entry.payments.push(p);
  }
}
const method = (f) =>
  ({ Dinheiro: "CASH", Pix: "PIX", "Cartão de crédito": "CREDIT", "Cartão de débito": "DEBIT" })[f] ?? null;
const balances = new Map();
for (const [customer, entry] of debts) {
  entry.debts.sort((a, b) => a.at.localeCompare(b.at));
  let paid = entry.paid;
  for (const d of entry.debts) {
    const applied = Math.min(paid, d.amount);
    d.remaining = d.amount - applied;
    paid -= applied;
  }
  if (paid > 0) console.warn(`Aviso: cliente ${customer} pagou R$ ${(paid / 100).toFixed(2)} a mais que devia; excedente ignorado.`);
  balances.set(customer, entry.debts.reduce((s, d) => s + d.remaining, 0));
}

const policy = JSON.parse(all("SELECT valor FROM gestao_config WHERE chave='politica_fiado'")[0]?.valor || "{}");
const defaultLimit = cents(policy.limite_credito ?? 200);
const customers = all("SELECT * FROM clientes ORDER BY id");
for (const c of customers) {
  const balance = balances.get(c.id) || 0;
  const limit = Math.max(c.limite_credito != null ? cents(c.limite_credito) : defaultLimit, balance);
  out(
    `INSERT INTO customers(id,name,document,phone,credit_limit,balance,active,address,note,term_days,interest_day,penalty_day) VALUES (` +
      [
        c.id,
        lit(String(c.nome).trim().slice(0, 160)),
        lit(blank(c.documento)),
        lit(blank(c.telefone)?.slice(0, 40)),
        (limit / 100).toFixed(2),
        (balance / 100).toFixed(2),
        c.ativo || balance > 0 ? "true" : "false",
        lit(blank(c.endereco)),
        lit(blank(c.observacao)),
        c.prazo_dias ?? "NULL",
        c.juros_dia ?? "NULL",
        c.multa_dia ?? "NULL",
      ].join(",") +
      ");",
  );
}

// Sales keep their ids; one payment per sale; old items have no cost, so the current cost is used.
const items = all("SELECT * FROM itens_venda ORDER BY venda_id,id");
const itemsBySale = new Map();
for (const i of items) {
  if (!itemsBySale.has(i.venda_id)) itemsBySale.set(i.venda_id, []);
  itemsBySale.get(i.venda_id).push(i);
}
const paymentMethod = {
  dinheiro: "CASH",
  pix: "PIX",
  cartao_debito: "DEBIT",
  cartao_credito: "CREDIT",
  cartao: "CREDIT",
  voucher: "VOUCHER",
  fiado: "ACCOUNT",
};
let centsFixed = 0;
for (const s of sales) {
  const total = cents(s.valor_total);
  out(
    `INSERT INTO sales(id,request_id,created_at,user_id,customer_id,total,fees,status) VALUES (${s.id},gen_random_uuid(),${ts(s.data_hora)},${ADMIN},${s.cliente_id ?? "NULL"},${money(s.valor_total)},${money(s.taxa_paga)},${s.cancelada ? "'CANCELLED'" : "'COMPLETED'"});`,
  );
  const lines = itemsBySale.get(s.id) || [];
  const totals = lines.map((i) => Math.round(i.quantidade * i.preco_unitario * 100));
  const delta = total - totals.reduce((a, b) => a + b, 0);
  if (delta !== 0 && lines.length) {
    totals[totals.length - 1] += delta;
    centsFixed++;
  }
  lines.forEach((i, index) => {
    const p = productById.get(i.produto_id);
    const gross = Math.round(i.quantidade * i.preco_unitario * 100);
    const discount = Math.max(0, gross - totals[index]);
    out(
      `INSERT INTO sale_items(id,sale_id,product_id,product_name,unit,quantity,unit_price,cost,discount,total) VALUES (${i.id},${s.id},${i.produto_id},${lit(blank(i.nome_original) || p.nome)},${lit(p.unidade === "KG" ? "KG" : "UN")},${qty(i.quantidade)},${money(i.preco_unitario)},${money(i.custo_unitario ?? p.preco_custo)},${(discount / 100).toFixed(2)},${(totals[index] / 100).toFixed(2)});`,
    );
  });
  out(
    `INSERT INTO payments(sale_id,method,amount,fee) VALUES (${s.id},'${paymentMethod[s.forma_pagamento] || "CASH"}',${money(s.valor_total)},${money(s.taxa_paga)});`,
  );
}
for (const [customer, entry] of debts) {
  for (const d of entry.debts)
    out(
      `INSERT INTO credits(customer_id,sale_id,created_at,due_date,amount,remaining,description,user_id) VALUES (${customer},${d.sale ?? "NULL"},${ts(d.at)},${lit(addDays(day(d.at), policy.prazo_dias ?? 30))},${(d.amount / 100).toFixed(2)},${(d.remaining / 100).toFixed(2)},${lit(d.description)},${ADMIN});`,
    );
  for (const p of entry.payments)
    out(
      `INSERT INTO credits(customer_id,created_at,amount,remaining,description,user_id,method) VALUES (${customer},${ts(p.data_hora)},${money(-p.valor)},0,${lit(blank(p.observacao) || "Pagamento " + IMPORTED + (p.forma_pagamento ? " • " + p.forma_pagamento : ""))},${ADMIN},${lit(method(p.forma_pagamento))});`,
    );
}

for (const m of all("SELECT * FROM movimentos_casco ORDER BY id"))
  out(
    `INSERT INTO bottle_movements(customer_id,bottle_type,quantity,note,created_at,user_id) VALUES (${m.cliente_id},${lit(blank(m.tipo_casco) || "Coca")},${m.quantidade},${lit(m.observacao || "")},${ts(m.data_hora)},${ADMIN});`,
  );
for (const r of all("SELECT * FROM receitas WHERE ativo=1")) {
  out(`INSERT INTO recipes(id,product_id,yield,note) VALUES (${r.id},${r.produto_id},${qty(r.rendimento)},${lit(r.observacao || "")});`);
  for (const i of all(`SELECT insumo_id,sum(quantidade) q FROM receita_itens WHERE receita_id=${r.id} GROUP BY insumo_id`))
    out(`INSERT INTO recipe_items(recipe_id,input_id,quantity) VALUES (${r.id},${i.insumo_id},${qty(i.q)});`);
}

// Store name and payment fees from config.json.
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const set = (key, value) =>
    value !== undefined &&
    value !== null &&
    value !== "" &&
    out(`INSERT INTO settings(id,value) VALUES (${lit(key)},${lit(value)}) ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value;`);
  set("store.name", config.nome_mercado);
  set("store.address", config.endereco_mercado);
  set("fee.CREDIT", config.taxa_credito);
  set("fee.DEBIT", config.taxa_debito);
  set("fee.PIX", config.taxa_pix);
  set("fee.VOUCHER", config.vouchers?.[0]?.taxa);
}

for (const table of [
  "categories",
  "products",
  "customers",
  "sales",
  "sale_items",
  "payments",
  "credits",
  "stock_movements",
  "stock_lots",
  "bottle_movements",
  "recipes",
  "recipe_items",
])
  out(`SELECT setval(pg_get_serial_sequence('${table}','id'),coalesce((SELECT max(id) FROM ${table}),0)+1,false);`);
out(
  `INSERT INTO audit_log(created_at,actor,action,entity,entity_id,details) VALUES (now(),'admin','IMPORT','python',NULL,${lit(`Importados ${products.length} produtos, ${customers.length} clientes, ${sales.length} vendas`)});`,
);

const balanceTotal = [...balances.values()].reduce((a, b) => a + b, 0);
const expected = all(
  "SELECT round(coalesce((SELECT sum(valor_total) FROM vendas WHERE forma_pagamento='fiado' AND cancelada=0),0) - coalesce((SELECT sum(valor) FROM pagamentos_fiado WHERE estornado=0),0),2) v",
)[0].v;
console.log(`Categorias: ${categoryIds.size}`);
console.log(`Produtos: ${products.length} (${lots.length} lote(s) de validade)`);
console.log(`Clientes: ${customers.length}; fiado em aberto: R$ ${(balanceTotal / 100).toFixed(2)} (sistema anterior: R$ ${Number(expected).toFixed(2)})`);
console.log(`Vendas: ${sales.length}, itens: ${items.length}; ${centsFixed} venda(s) com ajuste de 1 centavo`);
if (Math.abs(balanceTotal / 100 - expected) > 0.009) {
  console.error("Saldo de fiado não confere. Nada foi importado.");
  process.exit(1);
}
if (!apply) {
  console.log("Simulação concluída. Rode com --apply para importar.");
  process.exit(0);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const backupDir = path.join(root, "backups");
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `antes-importacao-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
const dump = spawnSync("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", "mercadinho", "-Fc", "mercadinho"], {
  cwd: root,
  maxBuffer: 1 << 30,
});
if (dump.status !== 0) {
  console.error("Falha no backup; importação cancelada.\n" + dump.stderr);
  process.exit(1);
}
fs.writeFileSync(backupFile, dump.stdout);
console.log("Backup salvo em " + backupFile);
const load = spawnSync(
  "docker",
  ["compose", "exec", "-T", "db", "psql", "-U", "mercadinho", "-d", "mercadinho", "-v", "ON_ERROR_STOP=1", "-q", "-1"],
  { cwd: root, input: sql.join("\n"), maxBuffer: 1 << 26 },
);
if (load.status !== 0) {
  console.error("Importação falhou e foi desfeita:\n" + load.stderr);
  process.exit(1);
}
console.log("Importação concluída.");
