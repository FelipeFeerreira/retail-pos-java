package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CashService {
  private final CashSessionRepository sessions;
  private final CashMovementRepository movements;
  private final JdbcTemplate jdbc;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;
  private final LedgerService ledger;

  public record PaymentTotal(String method, BigDecimal total) {}

  public record Summary(
      CashSession session,
      long sales,
      long cancelled,
      BigDecimal salesTotal,
      List<PaymentTotal> payments,
      BigDecimal cashSales,
      BigDecimal creditReceipts,
      BigDecimal supplies,
      BigDecimal withdrawals,
      BigDecimal expectedCash,
      List<CashMovement> movements) {}

  public CashService(
      CashSessionRepository sessions,
      CashMovementRepository movements,
      JdbcTemplate jdbc,
      CurrentUser current,
      AuditService audit,
      Updates updates,
      LedgerService ledger) {
    this.sessions = sessions;
    this.movements = movements;
    this.jdbc = jdbc;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
    this.ledger = ledger;
  }

  /** Locks the operator's open drawer; checkout and refunds must go through a drawer. */
  @Transactional
  public CashSession requireOpen(User user) {
    return sessions
        .lockOpen(user.id)
        .orElseThrow(() -> new BusinessException("Abra o caixa antes de registrar vendas"));
  }

  @Transactional(readOnly = true)
  public Optional<Summary> currentSummary() {
    return sessions.findOpen(current.get().id).map(this::summary);
  }

  @Transactional(readOnly = true)
  public Summary summary(Long id) {
    var session = sessions.findById(id).orElseThrow(EntityNotFoundException::new);
    checkAccess(session);
    return summary(session);
  }

  @Transactional(readOnly = true)
  public Page<CashSession> list(int page) {
    var request =
        PageRequest.of(Math.max(0, page), 30, Sort.by(Sort.Direction.DESC, "openedAt"));
    var user = current.get();
    return current.manager() ? sessions.findAll(request) : sessions.findByUserId(user.id, request);
  }

  @Transactional
  public Summary open(Dtos.CashOpen input) {
    var user = current.get();
    if (sessions.lockOpen(user.id).isPresent())
      throw new BusinessException("Você já possui um caixa aberto");
    var session = new CashSession();
    session.user = user;
    session.openedAt = Instant.now();
    session.openingAmount = Money.round(input.openingAmount());
    // The partial unique index rejects a concurrent second open with 409.
    sessions.saveAndFlush(session);
    audit.record("CASH_OPEN", "cash_sessions", session.id, "Fundo " + session.openingAmount);
    updates.publish("cash");
    return summary(session);
  }

  @Transactional
  public Summary movement(Long id, Dtos.CashMovementInput input) {
    var session = sessions.lock(id).orElseThrow(EntityNotFoundException::new);
    checkAccess(session);
    if (!"OPEN".equals(session.status)) throw new BusinessException("Caixa já fechado");
    var amount = Money.round(input.amount());
    if ("WITHDRAWAL".equals(input.type())
        && amount.compareTo(summary(session).expectedCash()) > 0)
      throw new BusinessException("Sangria maior que o dinheiro disponível no caixa");
    record(session, input.type(), amount, input.reason().trim());
    return summary(session);
  }

  /** Records cash handed back for a sale whose drawer is already closed. */
  @Transactional
  public void refund(Long saleId, BigDecimal amount) {
    var session = requireOpen(current.get());
    if (amount.compareTo(summary(session).expectedCash()) > 0)
      throw new BusinessException("Dinheiro insuficiente no caixa para o estorno");
    record(session, "WITHDRAWAL", amount, "Estorno venda #" + saleId);
  }

  @Transactional
  public Summary close(Long id, Dtos.CashClose input) {
    var session = sessions.lock(id).orElseThrow(EntityNotFoundException::new);
    checkAccess(session);
    if (!"OPEN".equals(session.status)) throw new BusinessException("Caixa já fechado");
    var expected = summary(session).expectedCash();
    session.status = "CLOSED";
    session.closedAt = Instant.now();
    session.closedBy = current.get();
    session.expectedCash = expected;
    session.countedCash = Money.round(input.countedCash());
    session.difference = session.countedCash.subtract(expected);
    session.notes = input.notes() == null || input.notes().isBlank() ? null : input.notes().trim();
    sessions.saveAndFlush(session);
    // Keeps the cash account equal to the money actually counted.
    ledger.post(
        ledger.account("CASH"),
        session.difference,
        LotService.today(),
        LedgerService.DRAWER_DIFFERENCE,
        "Fechamento do caixa #" + id,
        "DRAWER",
        id);
    audit.record(
        "CASH_CLOSE",
        "cash_sessions",
        id,
        "Esperado "
            + expected
            + " contado "
            + session.countedCash
            + " diferença "
            + session.difference);
    updates.publish("cash");
    return summary(session);
  }

  private void record(CashSession session, String type, BigDecimal amount, String reason) {
    var movement = new CashMovement();
    movement.session = session;
    movement.createdAt = Instant.now();
    movement.user = current.get();
    movement.type = type;
    movement.amount = amount;
    movement.reason = reason;
    movements.save(movement);
    audit.record(
        "WITHDRAWAL".equals(type) ? "CASH_WITHDRAWAL" : "CASH_SUPPLY",
        "cash_sessions",
        session.id,
        amount + " " + reason);
    updates.publish("cash");
  }

  private void checkAccess(CashSession session) {
    if (!session.user.id.equals(current.get().id) && !current.manager())
      throw new AccessDeniedException("Caixa de outro operador");
  }

  private Summary summary(CashSession session) {
    var totals =
        jdbc.queryForMap(
            "SELECT count(*) FILTER (WHERE status='COMPLETED') AS sales, count(*) FILTER (WHERE"
                + " status='CANCELLED') AS cancelled, coalesce(sum(total) FILTER (WHERE"
                + " status='COMPLETED'),0) AS total FROM sales WHERE cash_session_id=?",
            session.id);
    var payments =
        jdbc.query(
            "SELECT p.method, sum(p.amount) AS total FROM payments p JOIN sales s ON"
                + " s.id=p.sale_id WHERE s.cash_session_id=? AND s.status='COMPLETED' GROUP BY"
                + " p.method ORDER BY p.method",
            (row, i) -> new PaymentTotal(row.getString("method"), row.getBigDecimal("total")),
            session.id);
    var cashSales =
        payments.stream()
            .filter(p -> p.method().equals("CASH"))
            .map(PaymentTotal::total)
            .findFirst()
            .orElse(BigDecimal.ZERO);
    // Fiado paid in cash at this drawer (principal plus interest and penalty).
    var creditReceipts =
        Money.round(
            jdbc.queryForObject(
                "SELECT coalesce(sum(charges-amount),0) FROM credits WHERE cash_session_id=? AND"
                    + " amount<0",
                BigDecimal.class,
                session.id));
    var list = movements.findBySessionIdOrderById(session.id);
    var supplies = sum(list, "SUPPLY");
    var withdrawals = sum(list, "WITHDRAWAL");
    var expected =
        "CLOSED".equals(session.status)
            ? session.expectedCash
            : Money.round(
                session
                    .openingAmount
                    .add(cashSales)
                    .add(creditReceipts)
                    .add(supplies)
                    .subtract(withdrawals));
    return new Summary(
        session,
        ((Number) totals.get("sales")).longValue(),
        ((Number) totals.get("cancelled")).longValue(),
        Money.round((BigDecimal) totals.get("total")),
        payments,
        Money.round(cashSales),
        creditReceipts,
        supplies,
        withdrawals,
        expected,
        list);
  }

  private static BigDecimal sum(List<CashMovement> list, String type) {
    return Money.round(
        list.stream()
            .filter(m -> m.type.equals(type))
            .map(m -> m.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
  }
}
