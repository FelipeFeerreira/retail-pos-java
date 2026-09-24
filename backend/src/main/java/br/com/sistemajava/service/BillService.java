package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.security.CurrentUser;
import java.math.*;
import java.sql.Date;
import java.time.*;
import java.time.temporal.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contas e Boletos: cadastro de contas avulsas, recorrentes (todo mês) e parceladas, status
 * (a vencer, vence hoje, vencida, paga), filtros e planejamento de vencimentos. Pagamento,
 * estorno e cancelamento continuam no FinanceService.
 */
@Service
public class BillService {
  private final JdbcTemplate jdbc;
  private final LedgerService ledger;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;

  public BillService(
      JdbcTemplate jdbc,
      LedgerService ledger,
      CurrentUser current,
      AuditService audit,
      Updates updates) {
    this.jdbc = jdbc;
    this.ledger = ledger;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
  }

  private void checkSupplierAndCategory(Long supplierId, String category) {
    if (!FinanceService.EXPENSE_CATEGORIES.contains(category))
      throw new BusinessException("Categoria inválida");
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM suppliers WHERE id=? AND active=true)",
            Boolean.class,
            supplierId))) throw new BusinessException("Fornecedor/credor não encontrado");
  }

  /** Cria a conta; recorrente gera uma por mês e parcelada divide o valor em parcelas. */
  @Transactional
  public List<Long> create(Dtos.PayableCreate input) {
    checkSupplierAndCategory(input.supplierId(), input.category());
    var repeat = input.repeat() == null ? "NONE" : input.repeat();
    var today = LotService.today();
    var issued = input.issuedOn() == null ? today : input.issuedOn();
    var document = input.document() == null ? "" : input.document().trim();
    var description = input.description().trim();
    var note = input.note() == null ? "" : input.note().trim();
    if (!repeat.equals("NONE") && input.times() == null)
      throw new BusinessException("Informe quantas vezes a conta se repete");
    if (repeat.equals("NONE")
        && !document.isEmpty()
        && Boolean.TRUE.equals(
            jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM payables WHERE supplier_id=? AND"
                    + " lower(document)=lower(?) AND cancelled=false)",
                Boolean.class,
                input.supplierId(),
                document)))
      throw new BusinessException("Já existe uma conta com esse fornecedor e documento");
    var ids = new ArrayList<Long>();
    if (repeat.equals("NONE")) {
      ids.add(
          insert(
              input, description, document, input.amount(), input.dueDate(),
              input.competence() == null ? issued : input.competence(), issued, note, null, null,
              null, null));
    } else {
      var series = UUID.randomUUID();
      int times = input.times();
      // Parcelas: valor dividido em partes iguais; os centavos que sobram vão na última.
      var part =
          repeat.equals("INSTALLMENTS")
              ? input.amount().divide(BigDecimal.valueOf(times), 2, RoundingMode.DOWN)
              : input.amount();
      for (int i = 1; i <= times; i++) {
        var amount =
            repeat.equals("INSTALLMENTS") && i == times
                ? input.amount().subtract(part.multiply(BigDecimal.valueOf(times - 1)))
                : part;
        // Recorrente vence no mesmo dia de cada mês; parcela a cada 30 dias.
        var due =
            repeat.equals("MONTHLY")
                ? input.dueDate().plusMonths(i - 1)
                : input.dueDate().plusDays(30L * (i - 1));
        // Recorrente é despesa de cada mês; parcelado é uma despesa só, do mês da compra.
        var competence =
            repeat.equals("MONTHLY")
                ? due
                : input.competence() == null ? issued : input.competence();
        ids.add(
            insert(
                input, description + " (" + i + "/" + times + ")",
                document.isEmpty() ? "" : document + "/" + i, amount, due, competence, issued,
                note, series, repeat, i, times));
      }
    }
    audit.record(
        "CREATE", "payables", ids.get(0),
        description + " " + input.amount() + (repeat.equals("NONE") ? "" : " " + repeat));
    updates.publish("finance");
    return ids;
  }

  private Long insert(
      Dtos.PayableCreate input,
      String description,
      String document,
      BigDecimal amount,
      LocalDate due,
      LocalDate competence,
      LocalDate issued,
      String note,
      UUID series,
      String kind,
      Integer installment,
      Integer installments) {
    return jdbc.queryForObject(
        "INSERT INTO payables(supplier_id,description,category,document,amount,issued_on,due_date,"
            + "competence,created_at,user_id,barcode,note,series_id,series_kind,installment,"
            + "installments) VALUES(?,?,?,?,?,?,?,?,now(),?,?,?,?,?,?,?) RETURNING id",
        Long.class,
        input.supplierId(),
        description,
        input.category(),
        document,
        amount,
        Date.valueOf(issued),
        Date.valueOf(due),
        Date.valueOf(competence),
        current.get().id,
        installment == null || installment == 1 ? input.barcode() : null,
        note,
        series,
        kind,
        installment,
        installments);
  }

  /** Edita uma conta; o valor não pode ficar menor que o já pago. */
  @Transactional
  public void edit(Long id, Dtos.BillEdit input) {
    checkSupplierAndCategory(input.supplierId(), input.category());
    var paid =
        jdbc.queryForObject(
            "SELECT coalesce(sum(principal),0) FROM payable_payments WHERE payable_id=? AND"
                + " reversed=false",
            BigDecimal.class,
            id);
    if (input.amount().compareTo(paid) < 0)
      throw new BusinessException("O valor não pode ser menor que o já pago (R$ " + paid + ")");
    var changed =
        jdbc.update(
            "UPDATE payables SET supplier_id=?,description=?,category=?,document=?,amount=?,"
                + "due_date=?,competence=coalesce(?,competence),barcode=?,note=? WHERE id=? AND"
                + " cancelled=false",
            input.supplierId(),
            input.description().trim(),
            input.category(),
            input.document() == null ? "" : input.document().trim(),
            input.amount(),
            Date.valueOf(input.dueDate()),
            input.competence() == null ? null : Date.valueOf(input.competence()),
            input.barcode(),
            input.note() == null ? "" : input.note().trim(),
            id);
    if (changed == 0) throw new BusinessException("Conta não encontrada");
    audit.record("UPDATE", "payables", id, input.description() + " " + input.amount());
    updates.publish("finance");
  }

  private static final String BASE =
      "SELECT p.id,p.description,p.category,p.document,p.amount,p.issued_on AS \"issuedOn\","
          + "p.due_date AS \"dueDate\",p.competence,p.purchase_id AS \"purchaseId\",p.barcode,"
          + "p.note,p.series_id AS \"seriesId\",p.series_kind AS \"seriesKind\",p.installment,"
          + "p.installments,s.name AS supplier,p.supplier_id AS \"supplierId\","
          + "p.amount-coalesce((SELECT sum(principal) FROM payable_payments x WHERE"
          + " x.payable_id=p.id AND x.reversed=false),0) AS balance,"
          + "(SELECT max(paid_on) FROM payable_payments x WHERE x.payable_id=p.id AND"
          + " x.reversed=false) AS \"paidOn\",p.due_date-?::date AS \"daysLeft\" FROM payables p"
          + " JOIN suppliers s ON s.id=p.supplier_id WHERE p.cancelled=false";

  /** Status para a tela: PAID, OVERDUE, TODAY ou UPCOMING. */
  static String status(BigDecimal balance, int daysLeft) {
    if (balance.signum() <= 0) return "PAID";
    if (daysLeft < 0) return "OVERDUE";
    return daysLeft == 0 ? "TODAY" : "UPCOMING";
  }

  /** Lista com filtros por vencimento, status, categoria e fornecedor. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(
      LocalDate from, LocalDate to, String status, String category, Long supplierId) {
    var today = LotService.today();
    var sql = new StringBuilder("SELECT * FROM (" + BASE);
    var args = new ArrayList<Object>(List.of(Date.valueOf(today)));
    if (from != null) {
      sql.append(" AND p.due_date>=?");
      args.add(Date.valueOf(from));
    }
    if (to != null) {
      sql.append(" AND p.due_date<=?");
      args.add(Date.valueOf(to));
    }
    if (category != null && !category.isBlank()) {
      sql.append(" AND p.category=?");
      args.add(category);
    }
    if (supplierId != null) {
      sql.append(" AND p.supplier_id=?");
      args.add(supplierId);
    }
    sql.append(") t WHERE true");
    switch (status == null ? "ALL" : status) {
      case "PAID" -> sql.append(" AND balance<=0");
      case "OPEN" -> sql.append(" AND balance>0");
      case "OVERDUE" -> sql.append(" AND balance>0 AND \"daysLeft\"<0");
      case "TODAY" -> sql.append(" AND balance>0 AND \"daysLeft\"=0");
      case "UPCOMING" -> sql.append(" AND balance>0 AND \"daysLeft\">0");
      default -> {}
    }
    sql.append(" ORDER BY \"dueDate\",id LIMIT 1000");
    var rows = jdbc.queryForList(sql.toString(), args.toArray());
    var result = new ArrayList<Map<String, Object>>();
    for (var row : rows) {
      var copy = new LinkedHashMap<>(row);
      copy.put(
          "status",
          status((BigDecimal) row.get("balance"), ((Number) row.get("daysLeft")).intValue()));
      result.add(copy);
    }
    return result;
  }

  /**
   * Planejamento: contas em aberto por dia, semana e mês no período, alertas de atrasadas e
   * dos próximos dias, e o saldo projetado (dinheiro + banco menos o que vence até cada data).
   */
  @Transactional(readOnly = true)
  public Map<String, Object> plan(LocalDate from, LocalDate to, int alertDays) {
    var today = LotService.today();
    var open =
        jdbc.queryForList(
            "SELECT * FROM (" + BASE + ") t WHERE balance>0 ORDER BY \"dueDate\",id",
            Date.valueOf(today));
    var balance =
        ledger.accounts().stream()
            .map(a -> (BigDecimal) a.get("balance"))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    var overdue = BigDecimal.ZERO;
    var before = BigDecimal.ZERO;
    var byDay = new TreeMap<LocalDate, BigDecimal[]>();
    var byWeek = new TreeMap<LocalDate, BigDecimal>();
    var byMonth = new TreeMap<String, BigDecimal>();
    var alerts = new ArrayList<Map<String, Object>>();
    for (var bill : open) {
      var due = ((Date) bill.get("dueDate")).toLocalDate();
      var value = (BigDecimal) bill.get("balance");
      var daysLeft = ((Number) bill.get("daysLeft")).intValue();
      if (daysLeft < 0) overdue = overdue.add(value);
      // Vence entre hoje e o início do período: já sai do saldo projetado no começo.
      else if (due.isBefore(from)) before = before.add(value);
      if (daysLeft <= alertDays) {
        var copy = new LinkedHashMap<>(bill);
        copy.put("status", status(value, daysLeft));
        alerts.add(copy);
      }
      if (due.isBefore(from) || due.isAfter(to)) continue;
      byDay.computeIfAbsent(due, d -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
      byDay.get(due)[0] = byDay.get(due)[0].add(value);
      byDay.get(due)[1] = byDay.get(due)[1].add(BigDecimal.ONE);
      byWeek.merge(due.with(DayOfWeek.MONDAY), value, BigDecimal::add);
      byMonth.merge(due.toString().substring(0, 7), value, BigDecimal::add);
    }
    // Saldo projetado: parte do saldo atual, já descontadas as contas vencidas.
    var projected = balance.subtract(overdue).subtract(before);
    var days = new ArrayList<Map<String, Object>>();
    for (var entry : byDay.entrySet()) {
      if (!entry.getKey().isBefore(today)) projected = projected.subtract(entry.getValue()[0]);
      days.add(
          Map.of(
              "date", entry.getKey(),
              "total", entry.getValue()[0],
              "count", entry.getValue()[1].intValue(),
              "projectedBalance", projected));
    }
    var map = new LinkedHashMap<String, Object>();
    map.put("balance", balance);
    map.put("overdue", overdue);
    map.put("days", days);
    map.put(
        "weeks",
        byWeek.entrySet().stream()
            .map(e -> Map.of("week", e.getKey(), "total", e.getValue()))
            .toList());
    map.put(
        "months",
        byMonth.entrySet().stream()
            .map(e -> Map.of("month", e.getKey(), "total", e.getValue()))
            .toList());
    map.put("alerts", alerts);
    map.put("categories", FinanceService.EXPENSE_CATEGORIES);
    return map;
  }
}
