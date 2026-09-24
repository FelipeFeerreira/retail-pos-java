package br.com.sistemajava.service;

import br.com.sistemajava.api.*;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.time.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {
  private final ProductRepository products;
  private final CategoryRepository categories;
  private final StockMovementRepository movements;
  private final PriceRuleRepository rules;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;
  private final LotService lots;
  private final JdbcTemplate jdbc;

  public CatalogService(
      ProductRepository products,
      CategoryRepository categories,
      StockMovementRepository movements,
      PriceRuleRepository rules,
      CurrentUser current,
      AuditService audit,
      Updates updates,
      LotService lots,
      JdbcTemplate jdbc) {
    this.products = products;
    this.categories = categories;
    this.movements = movements;
    this.rules = rules;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
    this.lots = lots;
    this.jdbc = jdbc;
  }

  @Transactional
  public Product save(Long id, Dtos.ProductInput input) {
    var product =
        id == null ? new Product() : products.lock(id).orElseThrow(EntityNotFoundException::new);
    // Trocar a unidade é permitido (ex.: pão cadastrado como UN que é vendido por peso).
    // As vendas antigas guardam a unidade da época; para virar UN, o estoque e os lotes
    // precisam estar em números inteiros.
    if (id != null && !product.unit.equals(input.unit())) {
      if (input.unit().equals("UN")
          && (product.quantity.stripTrailingZeros().scale() > 0
              || Boolean.TRUE.equals(
                  jdbc.queryForObject(
                      "SELECT EXISTS(SELECT 1 FROM stock_lots WHERE product_id=? AND"
                          + " quantity<>trunc(quantity))",
                      Boolean.class,
                      id))))
        throw new BusinessException(
            "Para mudar para UN, ajuste antes o estoque e os lotes para quantidades inteiras");
      audit.record(
          "UNIT", "products", id, product.name + ": " + product.unit + " → " + input.unit());
    }
    Money.quantity(input.unit(), product.quantity);
    product.code = input.code().trim();
    product.barcode = blank(input.barcode());
    product.name = input.name().trim();
    product.category =
        input.categoryId() == null
            ? null
            : categories.findById(input.categoryId()).orElseThrow(EntityNotFoundException::new);
    product.unit = input.unit();
    if (product.price == null) product.price = input.price();
    else changePrice(product, input.price());
    product.cost = input.cost();
    product.minimumStock = input.minimumStock();
    // Once a product uses lots, its expiry is the earliest open lot.
    if (product.id == null || !lots.tracked(product.id)) product.expiresOn = input.expiresOn();
    if (input.perishable() != null) product.perishable = input.perishable();
    products.saveAndFlush(product);
    audit.record(id == null ? "CREATE" : "UPDATE", "products", product.id, product.name);
    updates.publish("stock");
    return product;
  }

  @Transactional
  public void delete(Long id) {
    var product = products.lock(id).orElseThrow(EntityNotFoundException::new);
    product.active = false;
    audit.record("ARCHIVE", "products", id, product.name);
    updates.publish("stock");
  }

  @Transactional
  public StockMovement stock(Dtos.StockInput input) {
    var product = products.lock(input.productId()).orElseThrow(EntityNotFoundException::new);
    if (!product.active) throw new BusinessException("Produto inativo");
    Money.quantity(product.unit, input.quantity());
    var delta =
        switch (input.type()) {
          case "IN" -> input.quantity();
          case "OUT" -> input.quantity().negate();
          default -> input.quantity().subtract(product.quantity);
        };
    if (product.quantity.add(delta).signum() < 0)
      throw new BusinessException("Estoque insuficiente");
    if (input.type().equals("ADJUSTMENT"))
      jdbc.update(
          "INSERT INTO inventory_counts(product_id,previous,counted,reason,created_at,user_id)"
              + " VALUES(?,?,?,?,now(),?)",
          product.id,
          product.quantity,
          input.quantity(),
          input.reason().trim(),
          current.get().id);
    if (delta.signum() < 0) lots.consume(product, delta.negate(), input.type(), null, true, null);
    if (delta.signum() > 0) {
      lots.receive(product, delta, input.expiresOn(), input.reason());
      // Weighted average cost of what was on hand and what arrived.
      if (input.unitCost() != null)
        product.cost =
            product
                .cost
                .multiply(product.quantity)
                .add(input.unitCost().multiply(delta))
                .divide(product.quantity.add(delta), 2, java.math.RoundingMode.HALF_UP);
    }
    product.quantity = product.quantity.add(delta);
    lots.sync(product);
    var move = movement(product, null, input.type(), delta, input.reason());
    audit.record("STOCK", "products", product.id, input.type() + ": " + delta);
    updates.publish("stock");
    return move;
  }

  /** Sets a new sale price, keeping the history of previous prices. */
  public void changePrice(Product product, BigDecimal price) {
    if (product.price.compareTo(price) == 0) return;
    jdbc.update(
        "INSERT INTO price_history(product_id,previous,current,created_at,user_id)"
            + " VALUES(?,?,?,now(),?)",
        product.id,
        product.price,
        price,
        current.get().id);
    product.price = price;
  }

  public StockMovement movement(
      Product product, Sale sale, String type, BigDecimal delta, String reason) {
    var movement = new StockMovement();
    movement.product = product;
    movement.sale = sale;
    movement.type = type;
    movement.quantity = delta;
    movement.reason = reason;
    movement.createdAt = Instant.now();
    movement.user = current.get();
    return movements.save(movement);
  }

  public BigDecimal price(Product product, String table) {
    var active = rules.active(product.id, table, Instant.now(), PageRequest.of(0, 1));
    return active.isEmpty() ? product.price : active.get(0).price;
  }

  public static String blank(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
