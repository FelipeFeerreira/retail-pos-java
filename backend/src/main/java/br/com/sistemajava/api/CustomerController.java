package br.com.sistemajava.api;

import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.service.*;
import jakarta.validation.Valid;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CustomerController {
  private final CustomerRepository customers;
  private final CreditRepository credits;
  private final CustomerService service;

  public CustomerController(
      CustomerRepository customers, CreditRepository credits, CustomerService service) {
    this.customers = customers;
    this.credits = credits;
    this.service = service;
  }

  @GetMapping("/customers")
  public Page<Customer> list(
      @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page) {
    return customers.search(q, PageRequest.of(Math.max(0, page), 100));
  }

  @PostMapping("/customers")
  public Customer create(@Valid @RequestBody Dtos.CustomerInput input) {
    return service.save(null, input);
  }

  @PutMapping("/customers/{id}")
  public Customer update(@PathVariable Long id, @Valid @RequestBody Dtos.CustomerInput input) {
    return service.save(id, input);
  }

  @DeleteMapping("/customers/{id}")
  @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
  public void delete(@PathVariable Long id) {
    service.delete(id);
  }

  /** Open fiado titles with interest and penalty as of today. */
  @GetMapping("/customers/{id}/titles")
  public Map<String, Object> titles(@PathVariable Long id) {
    return service.titles(id);
  }

  @GetMapping("/credits")
  public List<Credit> statement(@RequestParam Long customerId) {
    return credits.findByCustomerIdOrderByCreatedAtDesc(customerId);
  }

  @GetMapping("/credits/overdue")
  public List<Credit> overdue() {
    return credits.overdue(LocalDate.now(ZoneId.of("America/Sao_Paulo")));
  }

  @PostMapping("/credits/payments")
  public Customer pay(@Valid @RequestBody Dtos.CreditPayment input) {
    return service.pay(input);
  }
}
