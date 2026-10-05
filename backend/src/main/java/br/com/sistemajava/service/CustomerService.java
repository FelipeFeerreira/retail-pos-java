package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.EntityNotFoundException;
import java.math.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerService {
  private final CustomerRepository customers;
  private final CreditRepository credits;
  private final CashSessionRepository cashSessions;
  private final SettingRepository settings;
  private final LedgerService ledger;
  private final AuditService audit;
  private final CurrentUser current;
  private final Updates updates;

  /** Credit terms applied to a new fiado sale. */
  public record Policy(int termDays, BigDecimal interestDay, BigDecimal penaltyDay) {}

  public CustomerService(
      CustomerRepository customers,
      CreditRepository credits,
      CashSessionRepository cashSessions,
      SettingRepository settings,
      LedgerService ledger,
      AuditService audit,
      CurrentUser current,
      Updates updates) {
    this.customers = customers;
    this.credits = credits;
    this.cashSessions = cashSessions;
    this.settings = settings;
    this.ledger = ledger;
    this.audit = audit;
    this.current = current;
    this.updates = updates;
  }

  private String setting(String key, String fallback) {
    return settings.findById(key).map(s -> s.value).orElse(fallback);
  }

  public Policy policy(Customer customer) {
    return new Policy(
        customer.termDays != null
            ? customer.termDays
            : Integer.parseInt(setting("credit.termDays", "30")),
        customer.interestDay != null
            ? customer.interestDay
            : new BigDecimal(setting("credit.interestDay", "0")),
        customer.penaltyDay != null
            ? customer.penaltyDay
            : new BigDecimal(setting("credit.penaltyDay", "0")));
  }

  @Transactional
  public Customer save(Long id, Dtos.CustomerInput input) {
    var customer =
        id == null ? new Customer() : customers.lock(id).orElseThrow(EntityNotFoundException::new);
    if (input.creditLimit().compareTo(customer.balance) < 0)
      throw new BusinessException("Limite menor que o saldo devedor");
    var policyChanged =
        input.creditLimit().compareTo(customer.creditLimit) != 0
            || !Objects.equals(input.termDays(), customer.termDays)
            || !same(input.interestDay(), customer.interestDay)
            || !same(input.penaltyDay(), customer.penaltyDay);
    if (!current.manager() && policyChanged)
      throw new BusinessException("Somente gerente pode alterar limite, prazo e encargos do fiado");
    customer.name = input.name().trim();
    customer.document = CatalogService.blank(input.document());
    customer.phone = input.phone();
    customer.address = CatalogService.blank(input.address());
    customer.note = CatalogService.blank(input.note());
    customer.creditLimit = input.creditLimit();
    customer.termDays = input.termDays();
    customer.interestDay = input.interestDay();
    customer.penaltyDay = input.penaltyDay();
    customers.saveAndFlush(customer);
    audit.record(id == null ? "CREATE" : "UPDATE", "customers", customer.id, customer.name);
    return customer;
  }

  private static boolean same(BigDecimal a, BigDecimal b) {
    return a == null ? b == null : b != null && a.compareTo(b) == 0;
  }

  /** Records a manager-entered debit in the same statement used by fiado sales and payments. */
  @Transactional
  public Customer debit(Dtos.CustomerDebit input) {
    var customer = customers.lock(input.customerId()).orElseThrow(EntityNotFoundException::new);
    if (!customer.active) throw new BusinessException("Cliente inativo");
    var debit = new Credit();
    debit.customer = customer;
    debit.user = current.get();
    debit.createdAt = Instant.now();
    debit.dueDate = LotService.today();
    debit.amount = Money.round(input.amount());
    debit.remaining = debit.amount;
    debit.description = input.description().trim();
    var terms = policy(customer);
    debit.interestDay = terms.interestDay();
    debit.penaltyDay = terms.penaltyDay();
    customer.balance = customer.balance.add(debit.amount);
    credits.saveAndFlush(debit);
    audit.record("DEBIT", "credits", debit.id, "Cliente " + customer.id + ": " + debit.description + " R$ " + debit.amount);
    updates.publish("credit");
    return customer;
  }

  @Transactional
  public void delete(Long id) {
    var customer = customers.lock(id).orElseThrow(EntityNotFoundException::new);
    if (customer.balance.signum() != 0) throw new BusinessException("Cliente possui saldo devedor");
    customer.active = false;
    audit.record("ARCHIVE", "customers", id, customer.name);
  }

  /** Charges owed on an open debt: simple daily interest and penalty after the due date. */
  static BigDecimal charges(Credit debt, LocalDate today) {
    if (debt.dueDate == null || !debt.dueDate.isBefore(today)) return BigDecimal.ZERO;
    var days = ChronoUnit.DAYS.between(debt.dueDate, today);
    return Money.round(
        debt.remaining
            .multiply(debt.interestDay.add(debt.penaltyDay))
            .multiply(BigDecimal.valueOf(days))
            .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
  }

  /** Open fiado titles with days overdue and charges as of today. */
  @Transactional(readOnly = true)
  public Map<String, Object> titles(Long customerId) {
    var today = LotService.today();
    var list = new ArrayList<Map<String, Object>>();
    var principal = BigDecimal.ZERO;
    var charges = BigDecimal.ZERO;
    for (var debt : credits.unpaid(customerId)) {
      var charge = charges(debt, today);
      var row = new LinkedHashMap<String, Object>();
      row.put("id", debt.id);
      row.put("description", debt.description);
      row.put("createdAt", debt.createdAt);
      row.put("dueDate", debt.dueDate);
      row.put("amount", debt.amount);
      row.put("remaining", debt.remaining);
      row.put(
          "daysOverdue",
          debt.dueDate == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(debt.dueDate, today)));
      row.put("charges", charge);
      list.add(row);
      principal = principal.add(debt.remaining);
      charges = charges.add(charge);
    }
    return Map.of("titles", list, "principal", principal, "charges", charges);
  }

  @Transactional
  public Customer pay(Dtos.CreditPayment input) {
    var customer = customers.lock(input.customerId()).orElseThrow(EntityNotFoundException::new);
    var method = input.method() == null ? "CASH" : input.method();
    var previous = credits.findByPaymentRequestId(input.requestId());
    if (previous.isPresent()) {
      var payment = previous.get();
      if (!payment.customer.id.equals(customer.id)
          || payment.amount.negate().compareTo(input.amount()) != 0
          || !payment.description.equals(input.description())
          || !payment.user.username.equals(current.get().username))
        throw new BusinessException("Chave de pagamento reutilizada com dados diferentes");
      return customer;
    }
    if (input.amount().compareTo(customer.balance) > 0)
      throw new BusinessException("Pagamento maior que a dívida");
    var waive = Boolean.TRUE.equals(input.waiveCharges());
    if (waive && !current.manager())
      throw new BusinessException("Somente gerente pode dispensar juros e multa");
    var today = LotService.today();
    var remaining = input.amount();
    var charges = BigDecimal.ZERO;
    for (var debt : credits.unpaid(customer.id)) {
      var applied = remaining.min(debt.remaining);
      // Charges follow the share of principal paid, so partial payments are not charged twice.
      if (!waive)
        charges =
            charges.add(
                Money.round(
                    charges(debt, today)
                        .multiply(applied)
                        .divide(debt.remaining, 6, RoundingMode.HALF_UP)));
      debt.remaining = debt.remaining.subtract(applied);
      remaining = remaining.subtract(applied);
      if (remaining.signum() == 0) break;
    }
    if (remaining.signum() != 0)
      throw new BusinessException("Saldo inconsistente: confira o extrato");
    customer.balance = customer.balance.subtract(input.amount());
    var payment = new Credit();
    payment.customer = customer;
    payment.paymentRequestId = input.requestId();
    payment.user = current.get();
    payment.createdAt = Instant.now();
    payment.amount = input.amount().negate();
    payment.remaining = BigDecimal.ZERO;
    payment.description = input.description();
    payment.method = method;
    payment.charges = charges;
    // Cash received at the counter belongs to the operator's open drawer.
    if (method.equals("CASH"))
      payment.cashSessionId = cashSessions.findOpen(payment.user.id).map(s -> s.id).orElse(null);
    credits.saveAndFlush(payment);
    ledger.post(
        ledger.account(method.equals("CASH") ? "CASH" : "BANK"),
        input.amount().add(charges),
        today,
        LedgerService.CREDIT_RECEIPT,
        customer.name + " • " + input.description(),
        "CREDIT",
        payment.id);
    audit.record(
        "PAYMENT",
        "credits",
        payment.id,
        "Cliente " + customer.id + " principal " + input.amount() + " encargos " + charges);
    updates.publish("credit");
    return customer;
  }
}
