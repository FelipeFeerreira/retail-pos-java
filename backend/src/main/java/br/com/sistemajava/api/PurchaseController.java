package br.com.sistemajava.api;

import br.com.sistemajava.service.*;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class PurchaseController {
  private final PurchaseService purchases;
  private final ProductionService production;

  public PurchaseController(PurchaseService purchases, ProductionService production) {
    this.purchases = purchases;
    this.production = production;
  }

  @GetMapping("/suppliers")
  public List<Map<String, Object>> suppliers(@RequestParam(defaultValue = "") String q) {
    return purchases.suppliers(q);
  }

  @PostMapping("/suppliers")
  public Map<String, Object> createSupplier(@Valid @RequestBody Dtos.SupplierInput input) {
    return purchases.saveSupplier(null, input);
  }

  @PutMapping("/suppliers/{id}")
  public Map<String, Object> editSupplier(
      @PathVariable Long id, @Valid @RequestBody Dtos.SupplierInput input) {
    return purchases.saveSupplier(id, input);
  }

  @GetMapping("/purchases")
  public List<Map<String, Object>> purchases(@RequestParam(defaultValue = "0") int page) {
    return purchases.list(page);
  }

  @GetMapping("/purchases/{id}")
  public Map<String, Object> purchase(@PathVariable Long id) {
    return purchases.detail(id);
  }

  /** Receives a supplier document with several products atomically. */
  @PostMapping("/purchases")
  public Map<String, Object> receive(@Valid @RequestBody Dtos.PurchaseInput input) {
    return purchases.receive(input);
  }

  @GetMapping("/recipes")
  public List<Map<String, Object>> recipes() {
    return production.recipes();
  }

  @PostMapping("/recipes")
  public Map<String, Long> createRecipe(@Valid @RequestBody Dtos.RecipeInput input) {
    return Map.of("id", production.saveRecipe(null, input));
  }

  @PutMapping("/recipes/{id}")
  public Map<String, Long> editRecipe(
      @PathVariable Long id, @Valid @RequestBody Dtos.RecipeInput input) {
    return Map.of("id", production.saveRecipe(id, input));
  }

  @DeleteMapping("/recipes/{id}")
  public void deleteRecipe(@PathVariable Long id) {
    production.deleteRecipe(id);
  }

  @GetMapping("/productions")
  public List<Map<String, Object>> productions() {
    return production.productions();
  }

  @PostMapping("/productions")
  public Map<String, Object> produce(@Valid @RequestBody Dtos.ProductionInput input) {
    return production.produce(input);
  }
}
