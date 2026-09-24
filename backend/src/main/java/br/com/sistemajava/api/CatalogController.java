package br.com.sistemajava.api;

import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.service.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {
  private final ProductRepository products;
  private final CategoryRepository categories;
  private final PriceRuleRepository rules;
  private final StockMovementRepository movements;
  private final CatalogService catalog;
  private final ProductMapper mapper;
  private final AuditService audit;

  public CatalogController(
      ProductRepository products,
      CategoryRepository categories,
      PriceRuleRepository rules,
      StockMovementRepository movements,
      CatalogService catalog,
      ProductMapper mapper,
      AuditService audit) {
    this.products = products;
    this.categories = categories;
    this.rules = rules;
    this.movements = movements;
    this.catalog = catalog;
    this.mapper = mapper;
    this.audit = audit;
  }

  @GetMapping("/products")
  public Page<Dtos.ProductView> products(
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "40") int size) {
    return products
        .search(q.trim(), PageRequest.of(Math.max(0, page), Math.min(200, Math.max(1, size))))
        .map(mapper::toView);
  }

  @GetMapping("/products/{id}")
  public Dtos.ProductView product(@PathVariable Long id) {
    return mapper.toView(products.findById(id).orElseThrow(EntityNotFoundException::new));
  }

  @GetMapping("/products/{id}/price")
  public Map<String, Object> price(
      @PathVariable Long id, @RequestParam(defaultValue = "RETAIL") String table) {
    return Map.of(
        "price",
        catalog.price(products.findById(id).orElseThrow(EntityNotFoundException::new), table));
  }

  @PostMapping("/products")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public Dtos.ProductView create(@Valid @RequestBody Dtos.ProductInput input) {
    return mapper.toView(catalog.save(null, input));
  }

  @PutMapping("/products/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public Dtos.ProductView update(
      @PathVariable Long id, @Valid @RequestBody Dtos.ProductInput input) {
    return mapper.toView(catalog.save(id, input));
  }

  @DeleteMapping("/products/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public void delete(@PathVariable Long id) {
    catalog.delete(id);
  }

  @GetMapping("/alerts")
  public List<Dtos.ProductView> alerts() {
    return products.alerts(LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusDays(7)).stream()
        .map(mapper::toView)
        .toList();
  }

  @GetMapping("/categories")
  public List<Category> categories() {
    return categories.findAll(Sort.by("name"));
  }

  @PostMapping("/categories")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  @Transactional
  public Category category(@Valid @RequestBody Dtos.CategoryInput input) {
    var category = new Category();
    category.name = input.name().trim();
    category.markup = input.markup();
    categories.saveAndFlush(category);
    audit.record("CREATE", "categories", category.id, category.name);
    return category;
  }

  @PutMapping("/categories/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  @Transactional
  public Category editCategory(
      @PathVariable Long id, @Valid @RequestBody Dtos.CategoryInput input) {
    var category = categories.findById(id).orElseThrow(EntityNotFoundException::new);
    category.name = input.name().trim();
    category.markup = input.markup();
    audit.record("UPDATE", "categories", id, category.name);
    return category;
  }

  @DeleteMapping("/categories/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  @Transactional
  public void deleteCategory(@PathVariable Long id) {
    categories.deleteById(id);
    categories.flush();
    audit.record("DELETE", "categories", id, "");
  }

  @PostMapping("/stock-movements")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public StockMovement stock(@Valid @RequestBody Dtos.StockInput input) {
    return catalog.stock(input);
  }

  @GetMapping("/stock-movements")
  public Page<StockMovement> movements(
      @RequestParam Long productId, @RequestParam(defaultValue = "0") int page) {
    return movements.findByProductIdOrderByCreatedAtDesc(
        productId, PageRequest.of(Math.max(0, page), 50));
  }

  @GetMapping("/price-rules")
  public List<PriceRule> rules() {
    return rules.findAll(Sort.by(Sort.Direction.DESC, "startsAt"));
  }

  @PostMapping("/price-rules")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  @Transactional
  public PriceRule rule(@Valid @RequestBody Dtos.RuleInput input) {
    if (!input.endsAt().isAfter(input.startsAt()))
      throw new BusinessException("Fim deve ser posterior ao início");
    var rule = new PriceRule();
    rule.product = products.findById(input.productId()).orElseThrow(EntityNotFoundException::new);
    rule.tableName = input.tableName();
    rule.price = input.price();
    rule.startsAt = input.startsAt();
    rule.endsAt = input.endsAt();
    rules.save(rule);
    audit.record("CREATE", "price_rules", rule.id, rule.tableName);
    return rule;
  }

  @DeleteMapping("/price-rules/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  @Transactional
  public void deleteRule(@PathVariable Long id) {
    rules.deleteById(id);
    audit.record("DELETE", "price_rules", id, "");
  }
}
