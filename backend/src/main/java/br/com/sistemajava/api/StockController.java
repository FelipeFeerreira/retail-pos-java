package br.com.sistemajava.api;

import br.com.sistemajava.domain.Writeoff;
import br.com.sistemajava.service.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.*;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class StockController {
  private final StockService service;
  private final LotService lots;

  public StockController(StockService service, LotService lots) {
    this.service = service;
    this.lots = lots;
  }

  @PostMapping("/writeoffs")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public Writeoff writeoff(@Valid @RequestBody Dtos.WriteoffInput input) {
    return service.writeoff(input);
  }

  @GetMapping("/writeoffs")
  public Page<Writeoff> writeoffs(
      @RequestParam String kind, @RequestParam(defaultValue = "0") int page) {
    return service.list(kind, page);
  }

  @GetMapping("/writeoffs/summary")
  public Map<String, Object> summary(
      @RequestParam String kind,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    if (to.isBefore(from) || from.plusYears(2).isBefore(to))
      throw new BusinessException("Selecione um período de até dois anos");
    return service.summary(kind, from, to);
  }

  /** Open lots, optionally for one product or expiring within the given number of days. */
  @GetMapping("/lots")
  public List<Map<String, Object>> lots(
      @RequestParam(required = false) Long productId,
      @RequestParam(required = false) Integer days) {
    return lots.list(productId, days);
  }

  @PostMapping("/lots")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public Map<String, Long> lot(@Valid @RequestBody Dtos.LotInput input) {
    return Map.of("id", service.registerLot(input));
  }

  @PutMapping("/lots/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public void editLot(@PathVariable Long id, @Valid @RequestBody Dtos.LotEdit input) {
    service.editLot(id, input);
  }

  @GetMapping("/products/{id}/price-history")
  public List<Map<String, Object>> priceHistory(@PathVariable Long id) {
    return service.priceHistory(id);
  }

  @GetMapping("/inventory-counts")
  public List<Map<String, Object>> inventory(@RequestParam(required = false) Long productId) {
    return service.inventoryCounts(productId);
  }
}
