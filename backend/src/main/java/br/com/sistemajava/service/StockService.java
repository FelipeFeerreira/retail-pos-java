package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Losses, internal consumption, expiry lots, inventory counts and price history. */
@Service
public class StockService {
  public static final List<String> LOSS_REASONS =
      List.of("Validade vencida", "Estragado/danificado", "Quebra/avaria", "Furto", "Outro");
  public static final List<String> INTERNAL_REASONS =
      List.of(
          "Limpeza",
          "Lanches da equipe",
          "Embalagens e insumos operacionais (sacola, saco, filme)",
          "Consumo pessoal/família",
          "Produção",
          "Outro");
  private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

  private final WriteoffRepository writeoffs;
  private final WriteoffItemRepository writeoffItems;
  private final ProductRepository products;
  private final CatalogService catalog;
  private final LotService lots;
  private final JdbcTemplate jdbc;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;

  public StockService(
      WriteoffRepository writeoffs,
      WriteoffItemRepository writeoffItems,
      ProductRepository products,
      CatalogService catalog,
      LotService lots,
      JdbcTemplate jdbc,
      CurrentUser current,
      AuditService audit,
      Updates updates) {
    this.writeoffs = writeoffs;
    this.writeoffItems = writeoffItems;
    this.products = products;
    this.catalog = catalog;
    this.lots = lots;
    this.jdbc = jdbc;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
  }

  @Transactional
  public Writeoff writeoff(Dtos.WriteoffInput input) {
    var loss = input.kind().equals("LOSS");
    if (!(loss ? LOSS_REASONS : INTERNAL_REASONS).contains(input.reason()))
      throw new BusinessException("Motivo inválido");
    if (input.items().stream().map(Dtos.WriteoffItemInput::productId).distinct().count()
        != input.items().size()) throw new BusinessException("Agrupe produtos repetidos");
    var writeoff = new Writeoff();
    writeoff.kind = input.kind();
    writeoff.reason = input.reason();
    writeoff.note = input.note() == null ? "" : input.note().trim();
    writeoff.createdAt = Instant.now();
    writeoff.user = current.get();
    writeoffs.saveAndFlush(writeoff);
    var total = BigDecimal.ZERO;
    var label = (loss ? "Perda #" : "Consumo interno #") + writeoff.id + " • " + input.reason();
    // Same ascending product lock order as checkout.
    for (var entry :
        input.items().stream()
            .sorted(Comparator.comparing(Dtos.WriteoffItemInput::productId))
            .toList()) {
      var product = products.lock(entry.productId()).orElseThrow(EntityNotFoundException::new);
      Money.quantity(product.unit, entry.quantity());
      if (product.quantity.compareTo(entry.quantity()) < 0)
        throw new BusinessException("Estoque insuficiente: " + product.name);
      if (entry.lotId() != null && !lots.productOf(entry.lotId()).equals(product.id))
        throw new BusinessException("Lote não pertence ao produto");
      // Only losses may take expired goods; internal use follows the same rule as a sale.
      lots.consume(product, entry.quantity(), input.kind(), writeoff.id, loss, entry.lotId());
      product.quantity = product.quantity.subtract(entry.quantity());
      lots.sync(product);
      catalog.movement(product, null, input.kind(), entry.quantity().negate(), label);
      var item = new WriteoffItem();
      item.writeoff = writeoff;
      item.product = product;
      item.productName = product.name;
      item.unit = product.unit;
      item.quantity = entry.quantity();
      item.unitCost = product.cost;
      item.total = Money.round(product.cost.multiply(entry.quantity()));
      writeoff.items.add(writeoffItems.save(item));
      total = total.add(item.total);
    }
    writeoff.totalCost = Money.round(total);
    audit.record(
        loss ? "LOSS" : "INTERNAL_USE", "writeoffs", writeoff.id, input.reason() + " " + total);
    updates.publish("stock");
    return writeoff;
  }

  @Transactional(readOnly = true)
  public Page<Writeoff> list(String kind, int page) {
    var result =
        writeoffs.findByKind(
            kind, PageRequest.of(Math.max(0, page), 30, Sort.by(Sort.Direction.DESC, "createdAt")));
    result.forEach(w -> w.items.size());
    return result;
  }

  /** Cost totals today, this week and this month, plus the chosen period grouped by reason. */
  @Transactional(readOnly = true)
  public Map<String, Object> summary(String kind, LocalDate from, LocalDate to) {
    var today = LotService.today();
    var result = new LinkedHashMap<String, Object>();
    result.put("today", total(kind, today, today));
    result.put("week", total(kind, today.with(DayOfWeek.MONDAY), today));
    result.put("month", total(kind, today.withDayOfMonth(1), today));
    result.put(
        "byReason",
        jdbc.queryForList(
            "SELECT reason, count(*) AS count, sum(total_cost) AS total FROM writeoffs WHERE"
                + " kind=? AND created_at>=? AND created_at<? GROUP BY reason ORDER BY total DESC",
            kind,
            start(from),
            start(to.plusDays(1))));
    result.put("reasons", kind.equals("LOSS") ? LOSS_REASONS : INTERNAL_REASONS);
    return result;
  }

  @Transactional
  public Long registerLot(Dtos.LotInput input) {
    var product = products.lock(input.productId()).orElseThrow(EntityNotFoundException::new);
    Money.quantity(product.unit, input.quantity());
    var id = lots.register(product, input.quantity(), input.expiresOn(), input.note());
    lots.sync(product);
    audit.record("LOT", "products", product.id, input.quantity() + " vence " + input.expiresOn());
    updates.publish("stock");
    return id;
  }

  @Transactional
  public void editLot(Long lotId, Dtos.LotEdit input) {
    var product = products.lock(lots.productOf(lotId)).orElseThrow(EntityNotFoundException::new);
    Money.quantity(product.unit, input.quantity());
    lots.edit(product, lotId, input.quantity(), input.expiresOn(), input.note());
    lots.sync(product);
    audit.record("LOT_EDIT", "products", product.id, "Lote " + lotId);
    updates.publish("stock");
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> priceHistory(Long productId) {
    return jdbc.queryForList(
        "SELECT h.id,h.previous,h.current,h.created_at AS \"createdAt\",u.username FROM"
            + " price_history h JOIN users u ON u.id=h.user_id WHERE h.product_id=? ORDER BY"
            + " h.created_at DESC LIMIT 100",
        productId);
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> inventoryCounts(Long productId) {
    var sql =
        "SELECT i.id,i.product_id AS \"productId\",p.name AS \"productName\",p.unit,i.previous,"
            + "i.counted,i.counted-i.previous AS difference,round((i.counted-i.previous)*p.cost,2)"
            + " AS \"costImpact\",i.reason,i.created_at AS \"createdAt\",u.username FROM"
            + " inventory_counts i JOIN products p ON p.id=i.product_id JOIN users u ON"
            + " u.id=i.user_id";
    return productId == null
        ? jdbc.queryForList(sql + " ORDER BY i.created_at DESC LIMIT 200")
        : jdbc.queryForList(
            sql + " WHERE i.product_id=? ORDER BY i.created_at DESC LIMIT 200", productId);
  }

  private BigDecimal total(String kind, LocalDate from, LocalDate to) {
    return jdbc.queryForObject(
        "SELECT coalesce(sum(total_cost),0) FROM writeoffs WHERE kind=? AND created_at>=? AND"
            + " created_at<?",
        BigDecimal.class,
        kind,
        start(from),
        start(to.plusDays(1)));
  }

  private static Timestamp start(LocalDate day) {
    return Timestamp.from(day.atStartOfDay(ZONE).toInstant());
  }
}
