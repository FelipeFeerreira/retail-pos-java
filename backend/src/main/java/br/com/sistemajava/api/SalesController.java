package br.com.sistemajava.api;

import br.com.sistemajava.domain.Sale;
import br.com.sistemajava.repo.SaleRepository;
import br.com.sistemajava.service.SaleService;
import jakarta.validation.Valid;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/sales")
public class SalesController {
  private final SaleService service;
  private final SaleRepository sales;

  public SalesController(SaleService service, SaleRepository sales) {
    this.service = service;
    this.sales = sales;
  }

  @PostMapping
  public SaleService.Receipt checkout(@Valid @RequestBody Dtos.SaleInput input) {
    return service.checkout(input);
  }

  @GetMapping
  public Page<Sale> list(@RequestParam(defaultValue = "0") int page) {
    return sales.findAll(
        PageRequest.of(Math.max(0, page), 40, Sort.by(Sort.Direction.DESC, "createdAt")));
  }

  @GetMapping("/{id}")
  public SaleService.Receipt receipt(@PathVariable Long id) {
    return service.receipt(id);
  }

  @GetMapping("/{id}/items")
  public Object items(@PathVariable Long id) {
    return service.receipt(id).items();
  }

  @PostMapping("/{id}/cancel")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public SaleService.Receipt cancel(@PathVariable Long id) {
    return service.cancel(id);
  }
}
