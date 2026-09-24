package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.Product;
import br.com.sistemajava.repo.ProductRepository;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.EntityNotFoundException;
import java.math.*;
import java.sql.Date;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Recipes and production batches: inputs leave stock at cost, the product enters as a lot. */
@Service
public class ProductionService {
  private final JdbcTemplate jdbc;
  private final ProductRepository products;
  private final CatalogService catalog;
  private final LotService lots;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;

  public ProductionService(
      JdbcTemplate jdbc,
      ProductRepository products,
      CatalogService catalog,
      LotService lots,
      CurrentUser current,
      AuditService audit,
      Updates updates) {
    this.jdbc = jdbc;
    this.products = products;
    this.catalog = catalog;
    this.lots = lots;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
  }

  /** Active recipes with their inputs and the current cost of one batch. */
  @Transactional(readOnly = true)
  public List<Map<String, Object>> recipes() {
    var recipes =
        jdbc.queryForList(
            "SELECT r.id,r.product_id AS \"productId\",p.name AS \"productName\",p.unit,r.yield,"
                + "r.note,p.price FROM recipes r JOIN products p ON p.id=r.product_id WHERE"
                + " r.active=true ORDER BY p.name");
    var result = new ArrayList<Map<String, Object>>();
    for (var recipe : recipes) {
      var row = new LinkedHashMap<>(recipe);
      var items =
          jdbc.queryForList(
              "SELECT i.input_id AS \"inputId\",p.name AS \"inputName\",p.unit,i.quantity,p.cost,"
                  + "p.quantity AS stock FROM recipe_items i JOIN products p ON p.id=i.input_id"
                  + " WHERE i.recipe_id=? ORDER BY p.name",
              recipe.get("id"));
      var cost =
          items.stream()
              .map(
                  i ->
                      ((BigDecimal) i.get("quantity")).multiply((BigDecimal) i.get("cost")))
              .reduce(BigDecimal.ZERO, BigDecimal::add);
      row.put("items", items);
      row.put("batchCost", Money.round(cost));
      row.put(
          "unitCost",
          cost.divide((BigDecimal) recipe.get("yield"), 4, RoundingMode.HALF_UP));
      result.add(row);
    }
    return result;
  }

  @Transactional
  public Long saveRecipe(Long id, Dtos.RecipeInput input) {
    var product = products.findById(input.productId()).orElseThrow(EntityNotFoundException::new);
    if (!product.active) throw new BusinessException("Produto final inativo");
    if (input.items().stream().anyMatch(i -> i.inputId().equals(input.productId())))
      throw new BusinessException("O produto final não pode ser insumo da própria receita");
    if (input.items().stream().map(Dtos.RecipeItemInput::inputId).distinct().count()
        != input.items().size()) throw new BusinessException("Agrupe insumos repetidos");
    Money.quantity(product.unit, input.yield());
    for (var item : input.items()) {
      var ingredient =
          products.findById(item.inputId()).orElseThrow(EntityNotFoundException::new);
      Money.quantity(ingredient.unit, item.quantity());
    }
    var note = input.note() == null ? "" : input.note().trim();
    try {
      if (id == null)
        id =
            jdbc.queryForObject(
                "INSERT INTO recipes(product_id,yield,note) VALUES(?,?,?) ON CONFLICT(product_id)"
                    + " DO UPDATE SET yield=EXCLUDED.yield,note=EXCLUDED.note,active=true WHERE"
                    + " recipes.active=false RETURNING id",
                Long.class,
                input.productId(),
                input.yield(),
                note);
      else if (jdbc.update(
              "UPDATE recipes SET product_id=?,yield=?,note=? WHERE id=? AND active=true",
              input.productId(),
              input.yield(),
              note,
              id)
          == 0) throw new EntityNotFoundException();
    } catch (org.springframework.dao.EmptyResultDataAccessException | DuplicateKeyException ex) {
      throw new BusinessException("Esse produto já tem uma receita ativa");
    }
    jdbc.update("DELETE FROM recipe_items WHERE recipe_id=?", id);
    for (var item : input.items())
      jdbc.update(
          "INSERT INTO recipe_items(recipe_id,input_id,quantity) VALUES(?,?,?)",
          id,
          item.inputId(),
          item.quantity());
    audit.record("RECIPE", "recipes", id, product.name);
    return id;
  }

  @Transactional
  public void deleteRecipe(Long id) {
    if (jdbc.update("UPDATE recipes SET active=false WHERE id=?", id) == 0)
      throw new EntityNotFoundException();
    audit.record("ARCHIVE", "recipes", id, "");
  }

  @Transactional
  public Map<String, Object> produce(Dtos.ProductionInput input) {
    if (input.expiresOn().isBefore(LotService.today()))
      throw new BusinessException("Produção não pode entrar com validade vencida");
    var recipe =
        jdbc.queryForList(
            "SELECT product_id,yield FROM recipes WHERE id=? AND active=true", input.recipeId());
    if (recipe.isEmpty()) throw new BusinessException("Receita não encontrada");
    var finalId = ((Number) recipe.get(0).get("product_id")).longValue();
    var batchYield = (BigDecimal) recipe.get(0).get("yield");
    var items =
        jdbc.queryForList(
            "SELECT input_id,quantity FROM recipe_items WHERE recipe_id=? ORDER BY input_id",
            input.recipeId());
    if (items.isEmpty()) throw new BusinessException("Cadastre os insumos da receita");
    var produced =
        (input.actualYield() != null ? input.actualYield() : batchYield.multiply(input.multiplier()))
            .setScale(3, RoundingMode.HALF_UP);
    var user = current.get();
    var id =
        jdbc.queryForObject(
            "INSERT INTO productions(recipe_id,product_id,multiplier,produced,expires_on,"
                + "total_cost,unit_cost,note,created_at,user_id) VALUES(?,?,?,?,?,0,0,?,now(),?)"
                + " RETURNING id",
            Long.class,
            input.recipeId(),
            finalId,
            input.multiplier(),
            produced,
            Date.valueOf(input.expiresOn()),
            input.note() == null ? "" : input.note().trim(),
            user.id);
    var label = "Produção #" + id;
    // Lock every product in ascending id order, the final product included.
    var locked = new TreeMap<Long, Product>();
    var ids = new TreeSet<Long>();
    ids.add(finalId);
    items.forEach(i -> ids.add(((Number) i.get("input_id")).longValue()));
    for (var productId : ids)
      locked.put(productId, products.lock(productId).orElseThrow(EntityNotFoundException::new));
    var cost = BigDecimal.ZERO;
    for (var item : items) {
      var ingredient = locked.get(((Number) item.get("input_id")).longValue());
      var quantity =
          ((BigDecimal) item.get("quantity"))
              .multiply(input.multiplier())
              .setScale(3, RoundingMode.HALF_UP);
      Money.quantity(ingredient.unit, quantity.stripTrailingZeros());
      if (ingredient.quantity.compareTo(quantity) < 0)
        throw new BusinessException("Estoque insuficiente de " + ingredient.name);
      lots.consume(ingredient, quantity, "PRODUCTION", id, false, null);
      ingredient.quantity = ingredient.quantity.subtract(quantity);
      lots.sync(ingredient);
      catalog.movement(ingredient, null, "PRODUCTION", quantity.negate(), label);
      cost = cost.add(quantity.multiply(ingredient.cost));
      jdbc.update(
          "INSERT INTO production_inputs(production_id,product_id,product_name,unit,quantity,"
              + "unit_cost) VALUES(?,?,?,?,?,?)",
          id,
          ingredient.id,
          ingredient.name,
          ingredient.unit,
          quantity,
          ingredient.cost);
    }
    var product = locked.get(finalId);
    if (!product.active) throw new BusinessException("Produto final inativo");
    Money.quantity(product.unit, produced.stripTrailingZeros());
    cost = Money.round(cost);
    var unitCost = cost.divide(produced, 4, RoundingMode.HALF_UP);
    product.cost =
        product
            .cost
            .multiply(product.quantity)
            .add(cost)
            .divide(product.quantity.add(produced), 2, RoundingMode.HALF_UP);
    product.quantity = product.quantity.add(produced);
    product.perishable = true;
    lots.receive(product, produced, input.expiresOn(), label);
    lots.sync(product);
    catalog.movement(product, null, "PRODUCTION", produced, label);
    jdbc.update(
        "UPDATE productions SET total_cost=?,unit_cost=? WHERE id=?", cost, unitCost, id);
    audit.record("PRODUCTION", "productions", id, product.name + " " + produced + " custo " + cost);
    updates.publish("stock");
    return Map.of(
        "id", id, "productName", product.name, "produced", produced, "totalCost", cost,
        "unitCost", unitCost);
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> productions() {
    var rows =
        jdbc.queryForList(
            "SELECT pr.id,p.name AS \"productName\",p.unit,pr.multiplier,pr.produced,"
                + "pr.expires_on AS \"expiresOn\",pr.total_cost AS \"totalCost\",pr.unit_cost AS"
                + " \"unitCost\",pr.note,pr.created_at AS \"createdAt\",u.username FROM"
                + " productions pr JOIN products p ON p.id=pr.product_id JOIN users u ON"
                + " u.id=pr.user_id ORDER BY pr.created_at DESC LIMIT 100");
    var result = new ArrayList<Map<String, Object>>();
    for (var row : rows) {
      var copy = new LinkedHashMap<>(row);
      copy.put(
          "inputs",
          jdbc.queryForList(
              "SELECT product_name AS \"productName\",unit,quantity,unit_cost AS \"unitCost\" FROM"
                  + " production_inputs WHERE production_id=? ORDER BY id",
              row.get("id")));
      result.add(copy);
    }
    return result;
  }
}
