package br.com.sistemajava.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public final class Dtos {
  private Dtos() {}

  public record Login(
      @NotBlank @Size(max = 80) String username, @NotBlank @Size(max = 200) String password) {}

  public record ProductInput(
      @NotBlank @Size(max = 50) String code,
      @Size(max = 50) String barcode,
      @NotBlank @Size(max = 160) String name,
      Long categoryId,
      @Pattern(regexp = "UN|KG") @NotNull String unit,
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal price,
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal cost,
      @NotNull @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal minimumStock,
      LocalDate expiresOn,
      Boolean perishable) {}

  public record ProductView(
      Long id,
      Long version,
      String code,
      String barcode,
      String name,
      Long categoryId,
      String categoryName,
      String unit,
      BigDecimal price,
      BigDecimal cost,
      BigDecimal quantity,
      BigDecimal minimumStock,
      LocalDate expiresOn,
      boolean perishable,
      boolean active) {}

  public record CategoryInput(
      @NotBlank @Size(max = 100) String name,
      @DecimalMin("0") @DecimalMax("1000") @Digits(integer = 4, fraction = 2) BigDecimal markup) {}

  public record CustomerInput(
      @NotBlank @Size(max = 160) String name,
      @Size(max = 30) String document,
      @Size(max = 40) String phone,
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal creditLimit,
      @Size(max = 255) String address,
      @Size(max = 255) String note,
      @Min(0) @Max(365) Integer termDays,
      @DecimalMin("0") @DecimalMax("10") @Digits(integer = 3, fraction = 3) BigDecimal interestDay,
      @DecimalMin("0") @DecimalMax("10") @Digits(integer = 3, fraction = 3) BigDecimal penaltyDay) {}

  public record StockInput(
      @NotNull Long productId,
      @NotNull @Pattern(regexp = "IN|OUT|ADJUSTMENT") String type,
      @NotNull @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
      @NotBlank @Size(max = 255) String reason,
      LocalDate expiresOn,
      @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal unitCost) {}

  public record LotInput(
      @NotNull Long productId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 11, fraction = 3)
          BigDecimal quantity,
      LocalDate expiresOn,
      @Size(max = 255) String note) {}

  public record LotEdit(
      @NotNull @DecimalMin("0") @Digits(integer = 11, fraction = 3) BigDecimal quantity,
      LocalDate expiresOn,
      @Size(max = 255) String note) {}

  public record WriteoffItemInput(
      @NotNull Long productId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 11, fraction = 3)
          BigDecimal quantity,
      Long lotId) {}

  public record WriteoffInput(
      @NotNull @Pattern(regexp = "LOSS|INTERNAL") String kind,
      @NotBlank @Size(max = 80) String reason,
      @Size(max = 255) String note,
      @NotEmpty @Size(max = 100) List<@Valid WriteoffItemInput> items) {}

  public record SupplierInput(
      @NotBlank @Size(max = 160) String name,
      @Size(max = 30) String document,
      @Size(max = 40) String phone) {}

  public record PurchaseItemInput(
      @NotNull Long productId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 11, fraction = 3)
          BigDecimal quantity,
      @NotNull @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal unitCost,
      LocalDate expiresOn,
      @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal newPrice) {}

  public record PurchaseInput(
      @NotNull UUID requestId,
      @NotNull Long supplierId,
      @NotBlank @Size(max = 60) String document,
      @NotNull LocalDate dueDate,
      @NotNull @Pattern(regexp = "TERM|CASH") String payment,
      @NotEmpty @Size(max = 300) List<@Valid PurchaseItemInput> items,
      Long accountId) {}

  public record RecipeItemInput(
      @NotNull Long inputId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 11, fraction = 3)
          BigDecimal quantity) {}

  public record RecipeInput(
      @NotNull Long productId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 11, fraction = 3)
          BigDecimal yield,
      @Size(max = 255) String note,
      @NotEmpty @Size(max = 50) List<@Valid RecipeItemInput> items) {}

  public record ProductionInput(
      @NotNull Long recipeId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 7, fraction = 3)
          BigDecimal multiplier,
      @DecimalMin(value = "0", inclusive = false) @Digits(integer = 11, fraction = 3)
          BigDecimal actualYield,
      @NotNull LocalDate expiresOn,
      @Size(max = 255) String note) {}

  public record SettleInput(Long accountId, @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal fee) {}

  public record PayableCreate(
      @NotNull Long supplierId,
      @NotBlank @Size(max = 160) String description,
      @NotBlank String category,
      @Size(max = 60) String document,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal amount,
      LocalDate issuedOn,
      @NotNull LocalDate dueDate,
      LocalDate competence,
      @Pattern(regexp = "[0-9]{44}|[0-9]{47}|[0-9]{48}") String barcode,
      @Size(max = 255) String note,
      /** NONE, MONTHLY (repete todo mês) ou INSTALLMENTS (valor dividido em parcelas). */
      @Pattern(regexp = "NONE|MONTHLY|INSTALLMENTS") String repeat,
      @Min(2) @Max(60) Integer times) {}

  public record BillEdit(
      @NotNull Long supplierId,
      @NotBlank @Size(max = 160) String description,
      @NotBlank String category,
      @Size(max = 60) String document,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
          BigDecimal amount,
      @NotNull LocalDate dueDate,
      LocalDate competence,
      @Pattern(regexp = "[0-9]{44}|[0-9]{47}|[0-9]{48}") String barcode,
      @Size(max = 255) String note) {}

  public record PayableInput(
      @NotNull UUID requestId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal principal,
      @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal charges,
      @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal discount,
      LocalDate paidOn,
      @NotNull Long accountId,
      @NotBlank @Size(max = 20) String method,
      @Size(max = 120) String receipt) {}

  public record AccountInput(
      @NotBlank @Size(max = 80) String name,
      @Pattern(regexp = "CASH|BANK") String kind,
      @NotNull @Digits(integer = 12, fraction = 2) BigDecimal openingBalance,
      Boolean checked) {}

  public record EntryInput(
      @NotNull @Pattern(regexp = "IN|OUT") String type,
      @NotNull Long accountId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal amount,
      @NotNull LocalDate date,
      @NotBlank String category,
      @NotBlank @Size(max = 255) String description) {}

  public record TransferInput(
      @NotNull Long fromAccountId,
      @NotNull Long toAccountId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal amount,
      @NotNull LocalDate date,
      @Size(max = 255) String description) {}

  public record ReasonInput(@NotBlank @Size(max = 255) String reason) {}

  public record ItemInput(
      @NotNull Long productId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 8, fraction = 3)
          BigDecimal quantity,
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal discount) {}

  public record PaymentInput(
      @NotNull @Pattern(regexp = "CASH|CREDIT|DEBIT|PIX|VOUCHER|ACCOUNT") String method,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
          BigDecimal amount) {}

  public record SaleInput(
      @NotNull UUID requestId,
      Long customerId,
      @NotBlank @Size(max = 50) String priceTable,
      @NotEmpty @Size(max = 200) List<@Valid ItemInput> items,
      @NotEmpty @Size(max = 20) List<@Valid PaymentInput> payments) {}

  public record CreditPayment(
      @NotNull UUID requestId,
      @NotNull Long customerId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
          BigDecimal amount,
      @NotBlank @Size(max = 255) String description,
      @Pattern(regexp = "CASH|PIX|DEBIT|CREDIT") String method,
      Boolean waiveCharges) {}

  public record CustomerDebit(
      @NotNull Long customerId,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
          BigDecimal amount,
      @NotBlank @Size(max = 255) String description) {}

  public record CashOpen(
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal openingAmount) {}

  public record CashMovementInput(
      @NotNull @Pattern(regexp = "WITHDRAWAL|SUPPLY") String type,
      @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
          BigDecimal amount,
      @NotBlank @Size(max = 255) String reason) {}

  public record CashClose(
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal countedCash,
      @Size(max = 255) String notes) {}

  public record RuleInput(
      @NotNull Long productId,
      @NotBlank @Size(max = 50) String tableName,
      @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal price,
      @NotNull Instant startsAt,
      @NotNull Instant endsAt) {}

  public record UserInput(
      @NotBlank @Size(max = 80) String username,
      @NotBlank @Size(min = 8, max = 72) String password,
      @NotNull @Pattern(regexp = "ADMIN|MANAGER|CASHIER") String role) {}

  public record HardwareInput(
      @NotBlank @Size(max = 100) String name,
      @NotBlank @Size(max = 50) String type,
      @NotBlank @Size(max = 255) String address) {}

  public record RestoreInput(
      @NotBlank @Pattern(regexp = "backup-[0-9TZ-]+[.]dump") String filename,
      @NotBlank String confirmation) {}
}
