package br.com.sistemajava.api;

import br.com.sistemajava.service.*;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.LocalDate;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/finance")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class FinanceController {
  private final FinanceService finance;
  private final LedgerService ledger;
  private final BillService bills;

  public FinanceController(FinanceService finance, LedgerService ledger, BillService bills) {
    this.finance = finance;
    this.ledger = ledger;
    this.bills = bills;
  }

  private static void period(LocalDate from, LocalDate to) {
    if (to.isBefore(from) || from.plusYears(2).isBefore(to))
      throw new BusinessException("Selecione um período de até dois anos");
  }

  @GetMapping("/overview")
  public Map<String, Object> overview() {
    return finance.overview();
  }

  @GetMapping("/accounts")
  public List<Map<String, Object>> accounts() {
    return ledger.accounts();
  }

  @PostMapping("/accounts")
  public void createAccount(@Valid @RequestBody Dtos.AccountInput input) {
    if (input.kind() == null) throw new BusinessException("Informe o tipo da conta");
    finance.saveAccount(null, input);
  }

  @PutMapping("/accounts/{id}")
  public void editAccount(@PathVariable Long id, @Valid @RequestBody Dtos.AccountInput input) {
    finance.saveAccount(id, input);
  }

  @GetMapping("/entries")
  public List<Map<String, Object>> entries(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) Long accountId) {
    period(from, to);
    return ledger.entries(from, to, accountId);
  }

  @PostMapping("/entries")
  public Map<String, Long> entry(@Valid @RequestBody Dtos.EntryInput input) {
    return Map.of("id", finance.manualEntry(input));
  }

  @PostMapping("/entries/{id}/reverse")
  public void reverseEntry(@PathVariable Long id, @Valid @RequestBody Dtos.ReasonInput input) {
    finance.reverseEntry(id, input.reason());
  }

  @PostMapping("/transfers")
  public void transfer(@Valid @RequestBody Dtos.TransferInput input) {
    finance.transfer(input);
  }

  @GetMapping("/payables")
  public List<Map<String, Object>> payables(@RequestParam(defaultValue = "open") String status) {
    return finance.payables(status);
  }

  @PostMapping("/payables")
  public Map<String, Object> createPayable(@Valid @RequestBody Dtos.PayableCreate input) {
    var ids = bills.create(input);
    return Map.of("id", ids.get(0), "ids", ids);
  }

  @PutMapping("/payables/{id}")
  public void editPayable(@PathVariable Long id, @Valid @RequestBody Dtos.BillEdit input) {
    bills.edit(id, input);
  }

  /** Contas e Boletos: lista com filtros por vencimento, status, categoria e fornecedor. */
  @GetMapping("/bills")
  public List<Map<String, Object>> bills(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "ALL") String status,
      @RequestParam(required = false) String category,
      @RequestParam(required = false) Long supplierId) {
    return bills.list(from, to, status, category, supplierId);
  }

  /** Planejamento: vencimentos por dia/semana/mês, alertas e saldo projetado. */
  @GetMapping("/bills/plan")
  public Map<String, Object> plan(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "7") int alertDays) {
    period(from, to);
    return bills.plan(from, to, Math.max(0, Math.min(60, alertDays)));
  }

  @GetMapping("/payables/{id}/payments")
  public List<Map<String, Object>> payablePayments(@PathVariable Long id) {
    return finance.payablePayments(id);
  }

  @PostMapping("/payables/{id}/payments")
  public Map<String, Long> pay(@PathVariable Long id, @Valid @RequestBody Dtos.PayableInput input) {
    return Map.of("id", finance.pay(id, input));
  }

  @PostMapping("/payables/{id}/cancel")
  public void cancelPayable(@PathVariable Long id, @Valid @RequestBody Dtos.ReasonInput input) {
    finance.cancelPayable(id, input.reason());
  }

  @PostMapping("/payable-payments/{id}/reverse")
  public void reversePayment(@PathVariable Long id, @Valid @RequestBody Dtos.ReasonInput input) {
    finance.reversePayment(id, input.reason());
  }

  @GetMapping("/card-receivables")
  public List<Map<String, Object>> receivables(@RequestParam(defaultValue = "true") boolean open) {
    return finance.receivables(open);
  }

  @PostMapping("/card-receivables/{id}/settle")
  public void settle(@PathVariable Long id, @Valid @RequestBody Dtos.SettleInput input) {
    finance.settle(id, input);
  }

  @GetMapping("/dre")
  public Map<String, Object> dre(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    period(from, to);
    return finance.dre(from, to);
  }

  @GetMapping("/cashflow")
  public Map<String, Object> cashflow(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    period(from, to);
    return finance.cashflow(from, to);
  }

  @PostMapping("/statements/import")
  public Map<String, Integer> importStatement(
      @RequestParam Long accountId, @RequestParam("file") MultipartFile file) throws IOException {
    if (file.getSize() > 2_000_000) throw new BusinessException("Arquivo maior que 2 MB");
    return Map.of("imported", finance.importStatement(accountId, file.getInputStream()));
  }

  @GetMapping("/statements")
  public List<Map<String, Object>> statement(@RequestParam Long accountId) {
    return finance.statement(accountId);
  }

  @PostMapping("/statements/{id}/match")
  public void match(@PathVariable Long id, @RequestParam Long entryId) {
    finance.match(id, entryId);
  }
}
