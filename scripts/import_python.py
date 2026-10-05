"""Importa o banco do sistema Python (mercadinho.db) para o PostgreSQL deste sistema.

Uso:
    python scripts/import_python.py C:\\Sistemafmg\\mercadinho\\mercadinho.db            (simulação)
    python scripts/import_python.py C:\\Sistemafmg\\mercadinho\\mercadinho.db --apply    (importa)

Sem --apply só mostra o resumo. Com --apply faz backup (pg_dump) e troca os dados de negócio
numa única transação (tudo ou nada). Usuários, contas financeiras e demais ajustes são mantidos.
Requer o Docker rodando com `docker compose up -d`.
"""
import datetime as dt
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

args = sys.argv[1:]
db_path = next((a for a in args if a.lower().endswith(".db")), None)
if not db_path:
    print(__doc__)
    sys.exit(1)
config_path = args[args.index("--config") + 1] if "--config" in args else os.path.join(os.path.dirname(db_path), "config.json")
apply = "--apply" in args
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Copia o banco antes de ler, para não travar o sistema Python se ele estiver aberto.
snapshot = os.path.join(tempfile.mkdtemp(), "mercadinho.db")
shutil.copy2(db_path, snapshot)
src = sqlite3.connect(snapshot)
src.row_factory = sqlite3.Row
rows = lambda q: [dict(r) for r in src.execute(q).fetchall()]
has_column = lambda table, col: col in {r["name"] for r in src.execute(f"PRAGMA table_info({table})")}


def lit(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def blank(v):
    return None if v is None or str(v).strip() == "" else str(v).strip()


cents = lambda v: round(float(v or 0) * 100)
money = lambda v: f"{cents(v) / 100:.2f}"
qty = lambda v: f"{round(float(v or 0), 3):.3f}"
ts = lambda v: lit(str(v).replace(" ", "T") + "-03:00")


def add_days(d, n):
    return (dt.date.fromisoformat(str(d)[:10]) + dt.timedelta(days=n)).isoformat()


sql = []
out = sql.append
ADMIN = "(SELECT id FROM users WHERE username='admin')"
IMPORTED = "(sistema anterior)"

out("SET client_min_messages TO WARNING;")
out(
    "TRUNCATE TABLE bottle_movements,bank_statement_lines,card_receivables,payable_payments,payables,"
    "ledger_entries,production_inputs,productions,recipe_items,recipes,purchase_items,purchases,suppliers,"
    "lot_consumptions,stock_lots,writeoff_items,writeoffs,inventory_counts,price_history,cash_movements,"
    "cash_sessions,payments,sale_items,stock_movements,credits,price_rules,sales,products,customers,"
    "categories RESTART IDENTITY CASCADE;"
)

# Categorias: vazias viram "sem categoria"; variações de maiúsculas ficam na grafia mais usada.
category_ids = {}
for r in rows(
    "SELECT trim(categoria) name, count(*) n FROM produtos WHERE trim(coalesce(categoria,''))<>'' "
    "GROUP BY trim(categoria) ORDER BY n DESC"
):
    key = r["name"].lower()
    if key in category_ids:
        continue
    category_ids[key] = len(category_ids) + 1
    out(f"INSERT INTO categories(id,name) VALUES ({category_ids[key]},{lit(r['name'][:100])});")

# Produtos mantêm o id para vendas, receitas e lotes baterem direto.
lots = rows("SELECT * FROM lotes_validade WHERE quantidade>0 ORDER BY data_validade")
products = rows("SELECT * FROM produtos ORDER BY id")
product_by_id = {p["id"]: p for p in products}
for p in products:
    category = category_ids.get(p["categoria"].strip().lower()) if blank(p["categoria"]) else None
    unit = "KG" if p["unidade"] == "KG" else "UN"
    stock = max(0, round(p["quantidade_estoque"])) if unit == "UN" else max(0, p["quantidade_estoque"])
    p["_stock"] = stock
    lot = next((l for l in lots if l["produto_id"] == p["id"]), None)
    values = [
        p["id"],
        lit("INT-" + str(p["id"]).zfill(6)),
        lit(blank(p["codigo_barras"])),
        lit(str(p["nome"]).strip()[:160]),
        category or "NULL",
        lit(unit),
        money(p["preco_venda"]),
        money(p["preco_custo"]),
        qty(stock),
        qty(max(0, p["estoque_minimo"] or 0)),
        lit(lot["data_validade"]) if lot and lot["data_validade"] else "NULL",
        "true" if p["ativo"] else "false",
        "true" if lot else "false",
    ]
    out(
        "INSERT INTO products(id,code,barcode,name,category_id,unit,price,cost,quantity,minimum_stock,expires_on,active,perishable) "
        f"VALUES ({','.join(map(str, values))});"
    )
    if stock > 0:
        out(
            "INSERT INTO stock_movements(product_id,user_id,created_at,type,quantity,reason) "
            f"VALUES ({p['id']},{ADMIN},now(),'ADJUSTMENT',{qty(stock)},'Saldo importado {IMPORTED}');"
        )
lot_left = {}
for l in lots:
    p = product_by_id.get(l["produto_id"])
    if not p:
        continue
    available = lot_left.setdefault(p["id"], p["_stock"])
    q = min(l["quantidade"], available)
    if q <= 0:
        continue
    lot_left[p["id"]] -= q
    out(
        "INSERT INTO stock_lots(product_id,quantity,expires_on,received_at,note) "
        f"VALUES ({p['id']},{qty(q)},{lit(l['data_validade'])},{ts(l['data_entrada'])},{lit(blank(l['observacao']) or 'Lote importado')});"
    )

# Fiado: vendas fiado e "pagamentos" negativos (ajustes) são dívidas; pagamentos positivos
# quitam as dívidas mais antigas primeiro, então o saldo bate com o sistema anterior.
sales = rows("SELECT * FROM vendas ORDER BY id")
cancelled = lambda s: bool(s.get("cancelada"))
debts = {}
entry = lambda c: debts.setdefault(c, {"debts": [], "paid": 0, "payments": []})
for s in sales:
    if s["forma_pagamento"] == "fiado" and not cancelled(s) and s["cliente_id"] and cents(s["valor_total"]) > 0:
        entry(s["cliente_id"])["debts"].append(
            {"sale": s["id"], "amount": cents(s["valor_total"]), "at": s["data_hora"], "description": f"Venda #{s['id']}"}
        )
reversed_filter = " WHERE estornado=0" if has_column("pagamentos_fiado", "estornado") else ""
for p in rows(f"SELECT * FROM pagamentos_fiado{reversed_filter} ORDER BY data_hora,id"):
    if not p["valor"]:
        continue
    if p["valor"] < 0:
        entry(p["cliente_id"])["debts"].append(
            {"sale": None, "amount": cents(-p["valor"]), "at": p["data_hora"],
             "description": blank(p["observacao"]) or "Ajuste de saldo " + IMPORTED}
        )
    else:
        e = entry(p["cliente_id"])
        e["paid"] += cents(p["valor"])
        e["payments"].append(p)

FIADO_METHOD = {"Dinheiro": "CASH", "Pix": "PIX", "Cartão de crédito": "CREDIT", "Cartão de débito": "DEBIT"}
balances = {}
warnings = []
for customer, e in debts.items():
    e["debts"].sort(key=lambda d: d["at"])
    paid = e["paid"]
    for d in e["debts"]:
        applied = min(paid, d["amount"])
        d["remaining"] = d["amount"] - applied
        paid -= applied
    e["surplus"] = paid
    if paid > 0:
        warnings.append(f"Cliente {customer} tem R$ {paid / 100:.2f} de crédito (pagou a mais); o sistema novo não guarda crédito, anote à parte.")
    balances[customer] = sum(d["remaining"] for d in e["debts"])

TERM_DAYS = 30
DEFAULT_LIMIT = 20000  # R$ 200,00
customers = rows("SELECT * FROM clientes ORDER BY id")
for c in customers:
    balance = balances.get(c["id"], 0)
    limit = max(DEFAULT_LIMIT, balance)
    values = [
        c["id"],
        lit(str(c["nome"]).strip()[:160]),
        lit((blank(c.get("documento")) or "")[:30] or None),
        lit((blank(c.get("telefone")) or "")[:40] or None),
        f"{limit / 100:.2f}",
        f"{balance / 100:.2f}",
        "true" if c["ativo"] or balance > 0 else "false",
        lit((blank(c.get("endereco")) or "")[:255] or None),
        lit((blank(c.get("observacao")) or "")[:255] or None),
    ]
    out(
        "INSERT INTO customers(id,name,document,phone,credit_limit,balance,active,address,note) "
        f"VALUES ({','.join(map(str, values))});"
    )

# Vendas mantêm o id; um pagamento por venda; itens antigos não têm custo, usa o custo atual.
items_by_sale = {}
items = rows("SELECT * FROM itens_venda ORDER BY venda_id,id")
for i in items:
    items_by_sale.setdefault(i["venda_id"], []).append(i)
SALE_METHOD = {
    "dinheiro": "CASH", "pix": "PIX", "cartao_debito": "DEBIT", "cartao_credito": "CREDIT",
    "cartao": "CREDIT", "voucher": "VOUCHER", "fiado": "ACCOUNT",
}
cents_fixed = 0
for s in sales:
    total = cents(s["valor_total"])
    status = "'CANCELLED'" if cancelled(s) else "'COMPLETED'"
    out(
        "INSERT INTO sales(id,request_id,created_at,user_id,customer_id,total,fees,status) "
        f"VALUES ({s['id']},gen_random_uuid(),{ts(s['data_hora'])},{ADMIN},{s['cliente_id'] or 'NULL'},"
        f"{money(s['valor_total'])},{money(s.get('taxa_paga'))},{status});"
    )
    lines = items_by_sale.get(s["id"], [])
    totals = [round(i["quantidade"] * i["preco_unitario"] * 100) for i in lines]
    delta = total - sum(totals)
    if delta and lines:
        totals[-1] += delta
        cents_fixed += 1
    for i, line_total in zip(lines, totals):
        p = product_by_id[i["produto_id"]]
        gross = round(i["quantidade"] * i["preco_unitario"] * 100)
        discount = max(0, gross - line_total)
        out(
            "INSERT INTO sale_items(id,sale_id,product_id,product_name,unit,quantity,unit_price,cost,discount,total) "
            f"VALUES ({i['id']},{s['id']},{i['produto_id']},{lit(str(p['nome']).strip()[:160])},"
            f"{lit('KG' if p['unidade'] == 'KG' else 'UN')},{qty(i['quantidade'])},{money(i['preco_unitario'])},"
            f"{money(p['preco_custo'])},{discount / 100:.2f},{line_total / 100:.2f});"
        )
    if total > 0:
        out(
            "INSERT INTO payments(sale_id,method,amount,fee) "
            f"VALUES ({s['id']},'{SALE_METHOD.get(s['forma_pagamento'], 'CASH')}',{money(s['valor_total'])},{money(s.get('taxa_paga'))});"
        )

for customer, e in debts.items():
    for d in e["debts"]:
        out(
            "INSERT INTO credits(customer_id,sale_id,created_at,due_date,amount,remaining,description,user_id) "
            f"VALUES ({customer},{d['sale'] or 'NULL'},{ts(d['at'])},{lit(add_days(d['at'], TERM_DAYS))},"
            f"{d['amount'] / 100:.2f},{d['remaining'] / 100:.2f},{lit(d['description'][:255])},{ADMIN});"
        )
    for p in e["payments"]:
        forma = blank(p.get("forma_pagamento"))
        description = blank(p["observacao"]) or "Pagamento " + IMPORTED + (f" • {forma}" if forma else "")
        out(
            "INSERT INTO credits(customer_id,created_at,amount,remaining,description,user_id,method) "
            f"VALUES ({customer},{ts(p['data_hora'])},{money(-p['valor'])},0,{lit(description[:255])},{ADMIN},{lit(FIADO_METHOD.get(forma))});"
        )

for m in rows("SELECT * FROM movimentos_casco WHERE quantidade<>0 ORDER BY id"):
    out(
        "INSERT INTO bottle_movements(customer_id,bottle_type,quantity,note,created_at,user_id) "
        f"VALUES ({m['cliente_id']},{lit((blank(m['tipo_casco']) or 'Coca')[:40])},{m['quantidade']},"
        f"{lit(m['observacao'] or '')},{ts(m['data_hora'])},{ADMIN});"
    )
for r in rows("SELECT * FROM receitas WHERE ativo=1"):
    out(f"INSERT INTO recipes(id,product_id,yield,note) VALUES ({r['id']},{r['produto_id']},{qty(r['rendimento'])},{lit(r['observacao'] or '')});")
    for i in rows(f"SELECT insumo_id,sum(quantidade) q FROM receita_itens WHERE receita_id={r['id']} GROUP BY insumo_id"):
        out(f"INSERT INTO recipe_items(recipe_id,input_id,quantity) VALUES ({r['id']},{i['insumo_id']},{qty(i['q'])});")

# Nome da loja, endereço e taxas do config.json.
if os.path.exists(config_path):
    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)

    def setting(key, value):
        if value not in (None, ""):
            out(f"INSERT INTO settings(id,value) VALUES ({lit(key)},{lit(value)}) ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value;")

    setting("store.name", config.get("nome_mercado"))
    setting("store.address", config.get("endereco_mercado"))
    setting("fee.CREDIT", config.get("taxa_credito"))
    setting("fee.DEBIT", config.get("taxa_debito"))
    setting("fee.PIX", config.get("taxa_pix"))
    setting("fee.VOUCHER", (config.get("vouchers") or [{}])[0].get("taxa"))

for table in ["categories", "products", "customers", "sales", "sale_items", "payments", "credits",
              "stock_movements", "stock_lots", "bottle_movements", "recipes", "recipe_items"]:
    out(f"SELECT setval(pg_get_serial_sequence('{table}','id'),coalesce((SELECT max(id) FROM {table}),0)+1,false);")
out(
    "INSERT INTO audit_log(created_at,actor,action,entity,entity_id,details) VALUES (now(),'admin','IMPORT','python',NULL,"
    f"{lit(f'Importados {len(products)} produtos, {len(customers)} clientes, {len(sales)} vendas')});"
)

balance_total = sum(balances.values())
surplus_total = sum(e["surplus"] for e in debts.values())
expected = src.execute(
    "SELECT coalesce((SELECT sum(valor_total) FROM vendas WHERE forma_pagamento='fiado'),0)"
    " - coalesce((SELECT sum(valor) FROM pagamentos_fiado),0)"
).fetchone()[0]
print(f"Categorias: {len(category_ids)}")
print(f"Produtos: {len(products)} ({len(lots)} lote(s) de validade)")
print(f"Clientes: {len(customers)}; fiado em aberto: R$ {balance_total / 100:.2f}"
      f" (sistema anterior: R$ {expected:.2f}, créditos a favor de clientes: R$ {surplus_total / 100:.2f})")
print(f"Vendas: {len(sales)}, itens: {len(items)}; {cents_fixed} venda(s) com ajuste de centavos")
for w in warnings:
    print("Aviso: " + w)
if abs((balance_total - surplus_total) / 100 - expected) > 0.009:
    print("Saldo de fiado não confere. Nada foi importado.")
    sys.exit(1)
if not apply:
    print("Simulação concluída. Rode com --apply para importar.")
    sys.exit(0)

backup_dir = os.path.join(root, "backups")
os.makedirs(backup_dir, exist_ok=True)
backup_file = os.path.join(backup_dir, "antes-importacao-" + dt.datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".dump")
dump = subprocess.run(["docker", "compose", "exec", "-T", "db", "pg_dump", "-U", "mercadinho", "-Fc", "mercadinho"],
                      cwd=root, capture_output=True)
if dump.returncode != 0:
    print("Falha no backup; importação cancelada.\n" + dump.stderr.decode(errors="replace"))
    sys.exit(1)
with open(backup_file, "wb") as f:
    f.write(dump.stdout)
print("Backup salvo em " + backup_file)
load = subprocess.run(
    ["docker", "compose", "exec", "-T", "db", "psql", "-U", "mercadinho", "-d", "mercadinho", "-v", "ON_ERROR_STOP=1", "-q", "-1"],
    cwd=root, input="\n".join(sql).encode("utf-8"), capture_output=True,
)
if load.returncode != 0:
    print("Importação falhou e foi desfeita:\n" + load.stderr.decode(errors="replace"))
    sys.exit(1)
print("Importação concluída.")
