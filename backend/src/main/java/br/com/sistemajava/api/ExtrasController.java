package br.com.sistemajava.api;

import br.com.sistemajava.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.time.LocalDate;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ExtrasController {
  private final AnalyticsService analytics;
  private final BottleService bottles;
  private final CatalogExportService catalog;

  public record BottleInput(
      @Size(max = 40) String type,
      @NotNull @Min(1) @Max(1000) Integer quantity,
      @NotNull @Pattern(regexp = "TAKEN|RETURNED") String direction,
      @Size(max = 255) String note) {}

  public ExtrasController(
      AnalyticsService analytics, BottleService bottles, CatalogExportService catalog) {
    this.analytics = analytics;
    this.bottles = bottles;
    this.catalog = catalog;
  }

  @GetMapping("/reports/analytics")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public Map<String, Object> analytics(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return analytics.analytics(from, to);
  }

  @GetMapping("/bottles")
  public List<Map<String, Object>> openBottles() {
    return bottles.open();
  }

  @GetMapping("/customers/{id}/bottles")
  public Map<String, Object> customerBottles(@PathVariable Long id) {
    return bottles.customer(id);
  }

  @PostMapping("/customers/{id}/bottles")
  public Map<String, Object> bottle(@PathVariable Long id, @Valid @RequestBody BottleInput input) {
    bottles.register(id, input.type(), input.quantity(), input.direction(), input.note());
    return bottles.customer(id);
  }

  /** Price list for customers, grouped by category, as Excel. */
  @GetMapping("/products/catalog")
  public ResponseEntity<byte[]> catalog() throws IOException {
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=catalogo-precos.xlsx")
        .contentType(
            MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(catalog.catalog());
  }
}
