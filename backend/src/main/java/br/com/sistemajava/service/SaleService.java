package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.*;
import java.math.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SaleService {
  private final SaleRepository sales;
  private final SaleItemRepository items;
  private final PaymentRepository payments;
  private final ProductRepository products;
  private final CustomerRepository customers;
  private final CreditRepository credits;
  private final SettingRepository settings;
  private final CatalogService catalog;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;
  private final EntityManager em;
  private final RequestFingerprint fingerprint;
  private final CashService cash;
  private final CashSessionRepository cashSessions;
  private final LotService lots;
  private final FinanceService finance;
  private final CustomerService customerService;
  private final DrawerService drawer;

  public record Receipt(Sale sale, List<SaleItem> items, List<Payment> payments) {}

  public SaleService(
      SaleRepository sales,
      SaleItemRepository items,
      PaymentRepository payments,
      ProductRepository products,
      CustomerRepository customers,
      CreditRepository credits,
      SettingRepository settings,
      CatalogService catalog,
      CurrentUser current,
      AuditService audit,
      Updates updates,
      EntityManager em,
      RequestFingerprint fingerprint,
      CashService cash,
      CashSessionRepository cashSessions,
      LotService lots,
      FinanceService finance,
      CustomerService customerService,
      DrawerService drawer) {
    this.sales = sales;
    this.items = items;
    this.payments = payments;
    this.products = products;
    this.customers = customers;
    this.credits = credits;
    this.settings = settings;
    this.catalog = catalog;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
    this.em = em;
    this.fingerprint = fingerprint;
    this.cash = cash;
    this.cashSessions = cashSessions;
    this.lots = lots;
    this.finance = finance;
    this.customerService = customerService;
    this.drawer = drawer;
  }

  @Transactional(readOnly = true)
  public Receipt receipt(Long id) {
    return new Receipt(
        sales.findById(id).orElseThrow(EntityNotFoundException::new),
        items.findBySaleIdOrderById(id),
        payments.findBySaleId(id));
  }

  @Transactional
  public Receipt checkout(Dtos.SaleInput input) {
    // Transaction-scoped PostgreSQL lock serializes retries, including concurrent requests on
    // different backend replicas.
    em.createNativeQuery("SELECT pg_advisory_xact_lock(:key)")
        .setParameter(
            "key",
            input.requestId().getMostSignificantBits()
                ^ input.requestId().getLeastSignificantBits())
        .getSingleResult();
    var previous = sales.findByRequestId(input.requestId());
    if (previous.isPresent()) {
      if (!previous.get().user.username.equals(current.get().username)
          || !fingerprint.hash(input).equals(previous.get().requestHash))
        throw new BusinessException("Chave de venda reutilizada com dados diferentes");
      return receipt(previous.get().id);
    }
    if (input.items().stream().map(Dtos.ItemInput::productId).distinct().count()
        != input.items().size()) throw new BusinessException("Agrupe produtos repetidos");
    var sale = new Sale();
    sale.requestId = input.requestId();
    sale.requestHash = fingerprint.hash(input);
    sale.createdAt = Instant.now();
    sale.user = current.get();
    // All checkout transactions acquire the drawer, customer, then ascending product locks.
    sale.cashSession = cash.requireOpen(sale.user);
    if (input.customerId() != null) {
      sale.customer = customers.lock(input.customerId()).orElseThrow(EntityNotFoundException::new);
      if (!sale.customer.active) throw new BusinessException("Cliente inativo");
    }
    var lines = new ArrayList<SaleItem>();
    var shortages = new HashMap<Long, BigDecimal>();
    var total = BigDecimal.ZERO;
    for (var entry :
        input.items().stream().sorted(Comparator.comparing(Dtos.ItemInput::productId)).toList()) {
      var product = products.lock(entry.productId()).orElseThrow(EntityNotFoundException::new);
      if (!product.active) throw new BusinessException("Produto inativo: " + product.name);
      Money.quantity(product.unit, entry.quantity());
      // Sem estoque suficiente a venda passa: registra a entrada do que faltava e o
      // estoque termina em zero (conta como se houvesse o suficiente e foi vendido).
      var missing = entry.quantity().subtract(product.quantity);
      if (missing.signum() > 0) shortages.put(product.id, missing);
      var item = new SaleItem();
      item.sale = sale;
      item.product = product;
      item.productName = product.name;
      item.unit = product.unit;
      item.quantity = entry.quantity();
      item.unitPrice = catalog.price(product, input.priceTable());
      item.cost = product.cost;
      item.discount = entry.discount();
      item.total = Money.line(item.unitPrice, item.quantity, item.discount);
      total = total.add(item.total);
      lines.add(item);
    }
    var paid =
        input.payments().stream()
            .map(Dtos.PaymentInput::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    if (paid.compareTo(total) != 0)
      throw new BusinessException(
          "Pagamentos devem somar exatamente o total. Registre o valor líquido do dinheiro, sem"
              + " troco.");
    var account =
        input.payments().stream()
            .filter(p -> p.method().equals("ACCOUNT"))
            .map(Dtos.PaymentInput::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    if (account.signum() > 0) {
      if (sale.customer == null) throw new BusinessException("Selecione o cliente para fiado");
      Money.credit(sale.customer.balance, account, sale.customer.creditLimit);
      sale.customer.balance = sale.customer.balance.add(account);
    }
    sale.total = Money.round(total);
    sales.saveAndFlush(sale);
    items.saveAll(lines);
    var paymentList = new ArrayList<Payment>();
    for (var entry : input.payments()) {
      var payment = new Payment();
      payment.sale = sale;
      payment.method = entry.method();
      payment.amount = entry.amount();
      var rate =
          new BigDecimal(settings.findById("fee." + entry.method()).map(s -> s.value).orElse("0"));
      payment.fee = Money.round(entry.amount().multiply(rate).divide(new BigDecimal("100")));
      sale.fees = sale.fees.add(payment.fee);
      paymentList.add(payments.save(payment));
    }
    for (var item : lines) {
      var missing = shortages.get(item.product.id);
      if (missing != null) {
        catalog.movement(
            item.product, sale, "ADJUSTMENT", missing, "Venda sem estoque #" + sale.id);
        audit.record(
            "STOCK", "products", item.product.id, "Venda sem estoque: entrada automática de " + missing);
      }
      // Expiry lots are consumed first-expire-first-out; expired goods cannot be sold.
      var fromStock = missing == null ? item.quantity : item.quantity.subtract(missing);
      if (fromStock.signum() > 0)
        lots.consume(item.product, fromStock, "SALE", sale.id, false, null);
      item.product.quantity =
          item.product.quantity.subtract(item.quantity).max(BigDecimal.ZERO);
      lots.sync(item.product);
      catalog.movement(item.product, sale, "SALE", item.quantity.negate(), "Venda #" + sale.id);
    }
    if (account.signum() > 0) {
      var credit = new Credit();
      credit.sale = sale;
      credit.customer = sale.customer;
      credit.user = sale.user;
      credit.amount = account;
      credit.remaining = account;
      credit.createdAt = Instant.now();
      var policy = customerService.policy(sale.customer);
      credit.dueDate = LotService.today().plusDays(policy.termDays());
      credit.interestDay = policy.interestDay();
      credit.penaltyDay = policy.penaltyDay();
      credit.description = "Venda #" + sale.id;
      credits.save(credit);
    }
    finance.onSale(sale, paymentList);
    audit.record("CHECKOUT", "sales", sale.id, "Total " + sale.total);
    updates.publish("sale");
    drawer.afterSale(sale.id, paymentList.stream().map(p -> p.method).toList());
    return new Receipt(sale, lines, paymentList);
  }

  @Transactional
  public Receipt cancel(Long id) {
    var sale = sales.lock(id).orElseThrow(EntityNotFoundException::new);
    if ("CANCELLED".equals(sale.status)) return receipt(id);
    // An open drawer still counts this sale, so its expected cash drops automatically. Cash from
    // a closed drawer (or a sale before drawer control) leaves the canceller's open drawer.
    var drawer =
        sale.cashSession == null
            ? null
            : cashSessions.lock(sale.cashSession.id).orElseThrow(EntityNotFoundException::new);
    if (drawer == null || !"OPEN".equals(drawer.status)) {
      var refund =
          payments.findBySaleId(id).stream()
              .filter(p -> p.method.equals("CASH"))
              .map(p -> p.amount)
              .reduce(BigDecimal.ZERO, BigDecimal::add);
      if (refund.signum() > 0) cash.refund(id, refund);
    }
    if (sale.customer != null)
      sale.customer = customers.lock(sale.customer.id).orElseThrow(EntityNotFoundException::new);
    var debts = credits.findBySaleId(id);
    for (var debt : debts) {
      if (debt.remaining.compareTo(debt.amount) != 0)
        throw new BusinessException(
            "Fiado desta venda já recebeu pagamento. Concilie a devolução antes de cancelar.");
      sale.customer.balance = sale.customer.balance.subtract(debt.remaining);
      debt.remaining = BigDecimal.ZERO;
      var reversal = new Credit();
      reversal.customer = sale.customer;
      reversal.user = current.get();
      reversal.createdAt = Instant.now();
      reversal.amount = debt.amount.negate();
      reversal.remaining = BigDecimal.ZERO;
      reversal.description = "Cancelamento venda #" + id;
      credits.save(reversal);
    }
    var restocked = new ArrayList<Product>();
    for (var item :
        items.findBySaleIdOrderById(id).stream()
            .sorted(Comparator.comparing(i -> i.product.id))
            .toList()) {
      var product = products.lock(item.product.id).orElseThrow(EntityNotFoundException::new);
      product.quantity = product.quantity.add(item.quantity);
      restocked.add(product);
      catalog.movement(product, sale, "REVERSAL", item.quantity, "Cancelamento #" + id);
    }
    // Lots are touched only after every product row is locked, as in checkout.
    lots.restore("SALE", id);
    restocked.forEach(lots::sync);
    finance.onCancel(id);
    sale.status = "CANCELLED";
    audit.record("CANCEL", "sales", id, "Estoque e fiado estornados");
    updates.publish("sale");
    return receipt(id);
  }
}
