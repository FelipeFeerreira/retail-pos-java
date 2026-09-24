package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.SettingRepository;
import br.com.sistemajava.security.CurrentUser;
import java.io.*;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.sql.Date;
import java.time.*;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Money side of the store: sales into cash/bank/card receivables, bills to pay, transfers, the
 * management income statement (DRE) and bank reconciliation.
 */
@Service
public class FinanceService implements PurchaseService.PurchaseListener {
  public static final String GOODS = "Mercadoria para revenda";
  public static final List<String> EXPENSE_CATEGORIES =
      List.of(
          GOODS,
          "Aluguel",
          "Energia, água e internet",
          "Salários e encargos",
          "Impostos e taxas",
          "Manutenção",
          "Embalagens e material de uso",
          "Serviços (contador, sistema)",
          "Despesas fixas",
          "Outras despesas",
          "Investimento");
  private static final Set<String> NOT_EXPENSES = Set.of(GOODS, "Investimento");

  private final JdbcTemplate jdbc;
  private final LedgerService ledger;
  private final SettingRepository settings;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;

  public FinanceService(
      JdbcTemplate jdbc,
      LedgerService ledger,
      SettingRepository settings,
      CurrentUser current,
      AuditService audit,
      Updates updates) {
    this.jdbc = jdbc;
    this.ledger = ledger;
    this.settings = settings;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
  }

  private String setting(String key, String fallback) {
    return settings.findById(key).map(s -> s.value).orElse(fallback);
  }

  // ---------------------------------------------------------------- sales

  /** Cash goes to the cash account, Pix to the bank, cards become receivables. */
  @Transactional
  public void onSale(Sale sale, List<Payment> payments) {
    var today = LotService.today();
    for (var p : payments) {
      switch (p.method) {
        case "CASH" ->
            ledger.post(
                ledger.account("CASH"), p.amount, today, LedgerService.SALE,
                "Venda #" + sale.id, "SALE", sale.id);
        case "PIX" ->
            ledger.post(
                ledger.account("BANK"), p.amount.subtract(p.fee), today, LedgerService.SALE,
                "Venda #" + sale.id + " (Pix)", "SALE", sale.id);
        case "CREDIT", "DEBIT", "VOUCHER" ->
            jdbc.update(
                "INSERT INTO card_receivables(sale_id,method,gross,fee,expected_on)"
                    + " VALUES(?,?,?,?,?)",
                sale.id,
                p.method,
                p.amount,
                p.fee,
                Date.valueOf(
                    today.plusDays(Long.parseLong(setting("card.days" + p.method, "30")))));
        default -> {}
      }
    }
  }

  /** Undoes the money of a cancelled sale, including settled card receivables. */
  @Transactional
  public void onCancel(Long saleId) {
    ledger.reverseSource("SALE", saleId, "cancelamento da venda #" + saleId);
    for (var entry :
        jdbc.queryForList(
            "SELECT entry_id FROM card_receivables WHERE sale_id=? AND entry_id IS NOT NULL AND"
                + " cancelled=false",
            Long.class,
            saleId)) ledger.reverse(entry, "cancelamento da venda #" + saleId);
    jdbc.update("UPDATE card_receivables SET cancelled=true WHERE sale_id=?", saleId);
  }

  // ---------------------------------------------------------------- card receivables

  public List<Map<String, Object>> receivables(boolean open) {
    return jdbc.queryForList(
        "SELECT r.id,r.sale_id AS \"saleId\",r.method,r.gross,r.fee,r.gross-r.fee AS net,"
            + "r.expected_on AS \"expectedOn\",r.settled_on AS \"settledOn\",s.created_at AS"
            + " \"saleDate\" FROM card_receivables r JOIN sales s ON s.id=r.sale_id WHERE"
            + " r.cancelled=false AND (r.settled_on IS NULL)=? ORDER BY r.expected_on,r.id LIMIT"
            + " 500",
        open);
  }

  @Transactional
  public void settle(Long id, Dtos.SettleInput input) {
    var rows =
        jdbc.queryForList(
            "SELECT gross,fee,sale_id FROM card_receivables WHERE id=? AND settled_on IS NULL AND"
                + " cancelled=false FOR UPDATE",
            id);
    if (rows.isEmpty()) throw new BusinessException("Recebível inexistente ou já liquidado");
    var gross = (BigDecimal) rows.get(0).get("gross");
    var fee = input.fee() == null ? (BigDecimal) rows.get(0).get("fee") : input.fee();
    if (fee.compareTo(gross) > 0) throw new BusinessException("Taxa maior que o valor");
    var account = input.accountId() == null ? ledger.account("BANK") : input.accountId();
    ledger.requireAccount(account);
    var entry =
        ledger.post(
            account, gross.subtract(fee), LotService.today(), LedgerService.CARD_SETTLEMENT,
            "Cartão da venda #" + rows.get(0).get("sale_id"), "CARD", id);
    jdbc.update(
        "UPDATE card_receivables SET settled_on=CURRENT_DATE,fee=?,entry_id=? WHERE id=?",
        fee,
        entry,
        id);
    audit.record("CARD_SETTLE", "card_receivables", id, "Taxa " + fee);
    updates.publish("finance");
  }

  // ---------------------------------------------------------------- payables

  /** Every received purchase becomes a bill; cash purchases are paid at once. */
  @Override
  public void received(
      long purchaseId, Dtos.PurchaseInput input, BigDecimal total, String supplier) {
    var today = LotService.today();
    var payable =
        insertPayable(
            input.supplierId(), "Compra " + input.document().trim(), GOODS,
            input.document().trim(), total, today, input.dueDate(), today, purchaseId);
    if (input.payment().equals("CASH")) {
      var account = input.accountId() == null ? ledger.account("BANK") : input.accountId();
      pay(
          payable,
          new Dtos.PayableInput(
              UUID.randomUUID(), total, BigDecimal.ZERO, BigDecimal.ZERO, today, account,
              "À vista", ""));
    }
  }

  private Long insertPayable(
      Long supplierId,
      String description,
      String category,
      String document,
      BigDecimal amount,
      LocalDate issued,
      LocalDate due,
      LocalDate competence,
      Long purchaseId) {
    return jdbc.queryForObject(
        "INSERT INTO payables(supplier_id,description,category,document,amount,issued_on,due_date,"
            + "competence,purchase_id,created_at,user_id) VALUES(?,?,?,?,?,?,?,?,?,now(),?)"
            + " RETURNING id",
        Long.class,
        supplierId,
        description,
        category,
        document,
        amount,
        Date.valueOf(issued),
        Date.valueOf(due),
        Date.valueOf(competence),
        purchaseId,
        current.get().id);
  }

  public List<Map<String, Object>> payables(String status) {
    var filter =
        switch (status) {
          case "open" -> " AND balance>0";
          case "paid" -> " AND balance<=0";
          default -> "";
        };
    return jdbc.queryForList(
        "SELECT * FROM (SELECT p.id,p.description,p.category,p.document,p.amount,p.issued_on AS"
            + " \"issuedOn\",p.due_date AS \"dueDate\",p.competence,p.purchase_id AS"
            + " \"purchaseId\",s.name AS supplier,p.supplier_id AS \"supplierId\",p.amount-coalesce((SELECT"
            + " sum(principal) FROM payable_payments x WHERE x.payable_id=p.id AND"
            + " x.reversed=false),0) AS balance,p.due_date-CURRENT_DATE AS \"daysLeft\" FROM"
            + " payables p JOIN suppliers s ON s.id=p.supplier_id WHERE p.cancelled=false) t"
            + " WHERE true"
            + filter
            + " ORDER BY \"dueDate\",id LIMIT 500");
  }

  public List<Map<String, Object>> payablePayments(Long payableId) {
    return jdbc.queryForList(
        "SELECT x.id,x.principal,x.charges,x.discount,x.principal+x.charges-x.discount AS paid,"
            + "x.paid_on AS \"paidOn\",a.name AS account,x.method,x.receipt,x.reversed,u.username"
            + " FROM payable_payments x JOIN financial_accounts a ON a.id=x.account_id JOIN users"
            + " u ON u.id=x.user_id WHERE x.payable_id=? ORDER BY x.id",
        payableId);
  }

  @Transactional
  public Long pay(Long payableId, Dtos.PayableInput input) {
    var previous =
        jdbc.queryForList(
            "SELECT id FROM payable_payments WHERE request_id=?", Long.class, input.requestId());
    if (!previous.isEmpty()) return previous.get(0);
    var rows =
        jdbc.queryForList(
            "SELECT description,category,amount FROM payables WHERE id=? AND cancelled=false FOR"
                + " UPDATE",
            payableId);
    if (rows.isEmpty()) throw new BusinessException("Conta não encontrada");
    var paid =
        jdbc.queryForObject(
            "SELECT coalesce(sum(principal),0) FROM payable_payments WHERE payable_id=? AND"
                + " reversed=false",
            BigDecimal.class,
            payableId);
    var balance = ((BigDecimal) rows.get(0).get("amount")).subtract(paid);
    var charges = input.charges() == null ? BigDecimal.ZERO : input.charges();
    var discount = input.discount() == null ? BigDecimal.ZERO : input.discount();
    if (input.principal().compareTo(balance) > 0)
      throw new BusinessException("Pagamento maior que o saldo da conta");
    if (discount.compareTo(input.principal().add(charges)) > 0)
      throw new BusinessException("Desconto maior que o valor pago");
    ledger.requireAccount(input.accountId());
    var date = input.paidOn() == null ? LotService.today() : input.paidOn();
    var entry =
        ledger.post(
            input.accountId(),
            input.principal().add(charges).subtract(discount).negate(),
            date,
            (String) rows.get(0).get("category"),
            (String) rows.get(0).get("description"),
            "PAYABLE",
            payableId);
    var id =
        jdbc.queryForObject(
            "INSERT INTO payable_payments(payable_id,principal,charges,discount,paid_on,account_id,"
                + "method,receipt,entry_id,request_id,created_at,user_id) VALUES"
                + "(?,?,?,?,?,?,?,?,?,?,now(),?) RETURNING id",
            Long.class,
            payableId,
            input.principal(),
            charges,
            discount,
            Date.valueOf(date),
            input.accountId(),
            input.method(),
            input.receipt() == null ? "" : input.receipt().trim(),
            entry,
            input.requestId(),
            current.get().id);
    audit.record("PAY", "payables", payableId, "Pagamento #" + id + " " + input.principal());
    updates.publish("finance");
    return id;
  }

  @Transactional
  public void reversePayment(Long paymentId, String reason) {
    var rows =
        jdbc.queryForList(
            "SELECT entry_id FROM payable_payments WHERE id=? AND reversed=false FOR UPDATE",
            paymentId);
    if (rows.isEmpty()) throw new BusinessException("Pagamento não encontrado ou já estornado");
    if (rows.get(0).get("entry_id") != null)
      ledger.reverse(((Number) rows.get(0).get("entry_id")).longValue(), reason);
    jdbc.update("UPDATE payable_payments SET reversed=true WHERE id=?", paymentId);
    audit.record("REVERSE", "payable_payments", paymentId, reason);
    updates.publish("finance");
  }

  @Transactional
  public void cancelPayable(Long id, String reason) {
    if (Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM payable_payments WHERE payable_id=? AND reversed=false)",
            Boolean.class,
            id)))
      throw new BusinessException("Estorne os pagamentos antes de cancelar a conta");
    if (jdbc.update("UPDATE payables SET cancelled=true WHERE id=? AND cancelled=false", id) == 0)
      throw new BusinessException("Conta não encontrada");
    audit.record("CANCEL", "payables", id, reason);
    updates.publish("finance");
  }

  // ---------------------------------------------------------------- accounts and entries

  @Transactional
  public void saveAccount(Long id, Dtos.AccountInput input) {
    try {
      if (id == null)
        jdbc.update(
            "INSERT INTO financial_accounts(name,kind,opening_balance,checked) VALUES(?,?,?,?)",
            input.name().trim(),
            input.kind(),
            input.openingBalance(),
            Boolean.TRUE.equals(input.checked()));
      else if (jdbc.update(
              "UPDATE financial_accounts SET name=?,opening_balance=?,checked=? WHERE id=?",
              input.name().trim(),
              input.openingBalance(),
              Boolean.TRUE.equals(input.checked()),
              id)
          == 0) throw new BusinessException("Conta não encontrada");
    } catch (DuplicateKeyException ex) {
      throw new BusinessException("Já existe uma conta com esse nome");
    }
    audit.record("SAVE", "financial_accounts", id, input.name() + " " + input.openingBalance());
    updates.publish("finance");
  }

  @Transactional
  public Long manualEntry(Dtos.EntryInput input) {
    var income = input.type().equals("IN");
    if (!(income ? LedgerService.MANUAL_IN : LedgerService.MANUAL_OUT).contains(input.category()))
      throw new BusinessException("Categoria inválida");
    ledger.requireAccount(input.accountId());
    var id =
        ledger.post(
            input.accountId(),
            income ? input.amount() : input.amount().negate(),
            input.date(),
            input.category(),
            input.description().trim(),
            "MANUAL",
            "");
    audit.record("ENTRY", "ledger_entries", id, input.category() + " " + input.amount());
    updates.publish("finance");
    return id;
  }

  @Transactional
  public void transfer(Dtos.TransferInput input) {
    if (input.fromAccountId().equals(input.toAccountId()))
      throw new BusinessException("Escolha contas diferentes");
    ledger.requireAccount(input.fromAccountId());
    ledger.requireAccount(input.toAccountId());
    var reference = UUID.randomUUID().toString();
    var description =
        input.description() == null || input.description().isBlank()
            ? "Transferência entre contas"
            : input.description().trim();
    ledger.post(
        input.fromAccountId(), input.amount().negate(), input.date(), LedgerService.TRANSFER,
        description, "TRANSFER", reference);
    ledger.post(
        input.toAccountId(), input.amount(), input.date(), LedgerService.TRANSFER, description,
        "TRANSFER", reference);
    audit.record("TRANSFER", "ledger_entries", null, description + " " + input.amount());
    updates.publish("finance");
  }

  @Transactional
  public void reverseEntry(Long id, String reason) {
    var source =
        jdbc.queryForList("SELECT source FROM ledger_entries WHERE id=?", String.class, id);
    if (source.isEmpty()) throw new BusinessException("Lançamento não encontrado");
    // Documents (sales, bills, fiado) are reversed through their own screens.
    if (!Set.of("MANUAL", "TRANSFER").contains(source.get(0)))
      throw new BusinessException("Estorne pela operação de origem (venda, conta ou recebimento)");
    ledger.reverse(id, reason);
    audit.record("REVERSE", "ledger_entries", id, reason);
    updates.publish("finance");
  }

  // ---------------------------------------------------------------- reports

  private static Timestamp start(LocalDate day) {
    return Timestamp.from(day.atStartOfDay(ZoneId.of("America/Sao_Paulo")).toInstant());
  }

  private BigDecimal sum(String sql, Object... args) {
    var value = jdbc.queryForObject(sql, BigDecimal.class, args);
    return value == null ? BigDecimal.ZERO : Money.round(value);
  }

  /** Management income statement by competence: sales, cost of goods, losses and expenses. */
  @Transactional(readOnly = true)
  public Map<String, Object> dre(LocalDate from, LocalDate to) {
    var a = start(from);
    var b = start(to.plusDays(1));
    var revenue =
        sum("SELECT sum(total) FROM sales WHERE status='COMPLETED' AND created_at>=? AND created_at<?", a, b);
    var fees =
        sum("SELECT sum(fees) FROM sales WHERE status='COMPLETED' AND created_at>=? AND created_at<?", a, b);
    // Actual acquirer fees replace the estimate once receivables are settled.
    var feeAdjustment =
        sum(
            "SELECT sum(r.fee-p.fee) FROM card_receivables r JOIN payments p ON p.sale_id=r.sale_id"
                + " AND p.method=r.method JOIN sales s ON s.id=r.sale_id WHERE r.settled_on IS NOT"
                + " NULL AND r.cancelled=false AND s.created_at>=? AND s.created_at<?",
            a,
            b);
    fees = fees.add(feeAdjustment);
    var cogs =
        sum(
            "SELECT sum(i.cost*i.quantity) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE"
                + " s.status='COMPLETED' AND s.created_at>=? AND s.created_at<?",
            a,
            b);
    var losses =
        sum("SELECT sum(total_cost) FROM writeoffs WHERE kind='LOSS' AND created_at>=? AND created_at<?", a, b);
    var internal =
        sum("SELECT sum(total_cost) FROM writeoffs WHERE kind='INTERNAL' AND created_at>=? AND created_at<?", a, b);
    var expenses =
        jdbc.queryForList(
            "SELECT category,sum(amount) AS total FROM payables WHERE cancelled=false AND"
                + " competence BETWEEN ? AND ? AND category NOT IN (?,?) GROUP BY category ORDER BY"
                + " total DESC",
            Date.valueOf(from),
            Date.valueOf(to),
            GOODS,
            "Investimento");
    var looseExpenses =
        sum(
            "SELECT -sum(amount) FROM ledger_entries WHERE source='MANUAL' AND category='Despesa"
                + " avulsa' AND entry_date BETWEEN ? AND ?",
            Date.valueOf(from),
            Date.valueOf(to));
    var interestReceived =
        sum(
            "SELECT sum(charges) FROM credits WHERE amount<0 AND created_at>=? AND created_at<?",
            a,
            b);
    var chargesPaid =
        sum(
            "SELECT sum(charges-discount) FROM payable_payments WHERE reversed=false AND paid_on"
                + " BETWEEN ? AND ?",
            Date.valueOf(from),
            Date.valueOf(to));
    var otherIncome =
        sum(
            "SELECT sum(amount) FROM ledger_entries WHERE source='MANUAL' AND category='Outras"
                + " receitas' AND entry_date BETWEEN ? AND ?",
            Date.valueOf(from),
            Date.valueOf(to));
    var expenseTotal =
        expenses.stream()
            .map(e -> (BigDecimal) e.get("total"))
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .add(looseExpenses);
    var gross = revenue.subtract(fees).subtract(cogs);
    var result =
        gross
            .subtract(losses)
            .subtract(internal)
            .subtract(expenseTotal)
            .add(interestReceived)
            .subtract(chargesPaid)
            .add(otherIncome);
    var map = new LinkedHashMap<String, Object>();
    map.put("revenue", revenue);
    map.put("fees", fees);
    map.put("cogs", cogs);
    map.put("grossProfit", gross);
    map.put(
        "grossMargin",
        revenue.signum() == 0
            ? BigDecimal.ZERO
            : gross.multiply(BigDecimal.valueOf(100)).divide(revenue, 1, RoundingMode.HALF_UP));
    map.put("losses", losses);
    map.put("internalUse", internal);
    map.put("expenses", expenses);
    map.put("looseExpenses", looseExpenses);
    map.put("interestReceived", interestReceived);
    map.put("chargesPaid", chargesPaid);
    map.put("otherIncome", otherIncome);
    map.put("result", result);
    return map;
  }

  /** Realized cash flow from the ledger, without internal transfers. */
  @Transactional(readOnly = true)
  public Map<String, Object> cashflow(LocalDate from, LocalDate to) {
    var args = new Object[] {Date.valueOf(from), Date.valueOf(to)};
    var map = new LinkedHashMap<String, Object>();
    map.put(
        "inflows",
        jdbc.queryForList(
            "SELECT category,sum(amount) AS total FROM ledger_entries WHERE category<>'Transferência'"
                + " AND entry_date BETWEEN ? AND ? GROUP BY category HAVING sum(amount)>0 ORDER BY"
                + " total DESC",
            args));
    map.put(
        "outflows",
        jdbc.queryForList(
            "SELECT category,-sum(amount) AS total FROM ledger_entries WHERE"
                + " category<>'Transferência' AND entry_date BETWEEN ? AND ? GROUP BY category"
                + " HAVING sum(amount)<0 ORDER BY total DESC",
            args));
    map.put(
        "daily",
        jdbc.queryForList(
            "SELECT entry_date AS day,sum(amount) FILTER (WHERE amount>0) AS inflow,-sum(amount)"
                + " FILTER (WHERE amount<0) AS outflow FROM ledger_entries WHERE"
                + " category<>'Transferência' AND entry_date BETWEEN ? AND ? GROUP BY entry_date"
                + " ORDER BY entry_date",
            args));
    map.put(
        "net",
        sum(
            "SELECT sum(amount) FROM ledger_entries WHERE category<>'Transferência' AND entry_date"
                + " BETWEEN ? AND ?",
            args));
    map.put("accounts", ledger.accounts());
    return map;
  }

  /** What needs attention: balances, bills due soon, receivables and fiado. */
  @Transactional(readOnly = true)
  public Map<String, Object> overview() {
    var map = new LinkedHashMap<String, Object>();
    map.put("accounts", ledger.accounts());
    var open = payables("open");
    map.put("payablesOverdue", open.stream().filter(p -> ((Number) p.get("daysLeft")).intValue() < 0).toList());
    map.put(
        "payablesNext7",
        open.stream()
            .filter(
                p -> {
                  var days = ((Number) p.get("daysLeft")).intValue();
                  return days >= 0 && days <= 7;
                })
            .toList());
    map.put("payablesOpen", open.stream().map(p -> (BigDecimal) p.get("balance")).reduce(BigDecimal.ZERO, BigDecimal::add));
    map.put(
        "cardsOpen",
        sum("SELECT sum(gross-fee) FROM card_receivables WHERE settled_on IS NULL AND cancelled=false"));
    map.put("creditOpen", sum("SELECT sum(remaining) FROM credits WHERE remaining>0"));
    map.put(
        "creditOverdue",
        sum("SELECT sum(remaining) FROM credits WHERE remaining>0 AND due_date<CURRENT_DATE"));
    map.put("categories", EXPENSE_CATEGORIES);
    map.put("manualIn", LedgerService.MANUAL_IN);
    map.put("manualOut", LedgerService.MANUAL_OUT);
    return map;
  }

  // ---------------------------------------------------------------- bank reconciliation

  /** Imports "data;descricao;valor;identificador" lines; repeated identifiers are ignored. */
  @Transactional
  public int importStatement(Long accountId, InputStream csv) throws IOException {
    ledger.requireAccount(accountId);
    var reader = new BufferedReader(new InputStreamReader(csv, StandardCharsets.UTF_8));
    var header = reader.readLine();
    if (header == null) throw new BusinessException("Arquivo vazio");
    var columns = List.of(header.replace("﻿", "").trim().toLowerCase().split(";"));
    var need = List.of("data", "descricao", "valor", "identificador");
    if (!columns.containsAll(need))
      throw new BusinessException("CSV deve conter data;descricao;valor;identificador");
    int imported = 0, line = 1;
    String row;
    while ((row = reader.readLine()) != null) {
      line++;
      if (row.isBlank()) continue;
      if (line > 5001) throw new BusinessException("Máximo de 5.000 linhas por arquivo");
      var cells = row.split(";", -1);
      try {
        var date = LocalDate.parse(cells[columns.indexOf("data")].trim());
        var text = cells[columns.indexOf("valor")].trim();
        // Brazilian bank exports use 1.234,56; others use 1234.56.
        var amount =
            new BigDecimal(text.contains(",") ? text.replace(".", "").replace(",", ".") : text);
        var identifier = cells[columns.indexOf("identificador")].trim();
        if (identifier.isEmpty()) throw new BusinessException("Identificador obrigatório");
        imported +=
            jdbc.update(
                "INSERT INTO bank_statement_lines(account_id,line_date,description,amount,identifier)"
                    + " VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
                accountId,
                Date.valueOf(date),
                cells[columns.indexOf("descricao")].trim(),
                Money.round(amount),
                identifier);
      } catch (BusinessException ex) {
        throw new BusinessException("Linha " + line + ": " + ex.getMessage());
      } catch (RuntimeException ex) {
        throw new BusinessException("Linha " + line + ": data (AAAA-MM-DD) ou valor inválido");
      }
    }
    audit.record("IMPORT", "bank_statement_lines", accountId, imported + " linhas");
    return imported;
  }

  /** Statement lines with the unreconciled entries of the same account and amount. */
  public List<Map<String, Object>> statement(Long accountId) {
    var lines =
        jdbc.queryForList(
            "SELECT l.id,l.line_date AS date,l.description,l.amount,l.identifier,l.entry_id AS"
                + " \"entryId\" FROM bank_statement_lines l WHERE l.account_id=? ORDER BY"
                + " l.entry_id IS NOT NULL,l.line_date DESC LIMIT 300",
            accountId);
    var result = new ArrayList<Map<String, Object>>();
    for (var line : lines) {
      var copy = new LinkedHashMap<>(line);
      if (line.get("entryId") == null)
        copy.put(
            "candidates",
            jdbc.queryForList(
                "SELECT id,entry_date AS date,description,amount FROM ledger_entries WHERE"
                    + " account_id=? AND amount=? AND reconciled=false ORDER BY abs(entry_date-?)"
                    + " LIMIT 5",
                accountId,
                line.get("amount"),
                line.get("date")));
      result.add(copy);
    }
    return result;
  }

  @Transactional
  public void match(Long lineId, Long entryId) {
    var line =
        jdbc.queryForList(
            "SELECT account_id,amount FROM bank_statement_lines WHERE id=? AND entry_id IS NULL",
            lineId);
    var entry =
        jdbc.queryForList(
            "SELECT account_id,amount FROM ledger_entries WHERE id=? AND reconciled=false",
            entryId);
    if (line.isEmpty()
        || entry.isEmpty()
        || !line.get(0).get("account_id").equals(entry.get(0).get("account_id"))
        || ((BigDecimal) line.get(0).get("amount"))
                .compareTo((BigDecimal) entry.get(0).get("amount"))
            != 0)
      throw new BusinessException(
          "Extrato e lançamento devem ter a mesma conta e valor, sem conciliação anterior");
    jdbc.update("UPDATE bank_statement_lines SET entry_id=? WHERE id=?", entryId, lineId);
    jdbc.update("UPDATE ledger_entries SET reconciled=true WHERE id=?", entryId);
    audit.record("RECONCILE", "bank_statement_lines", lineId, "Lançamento " + entryId);
  }
}
