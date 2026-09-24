package br.com.sistemajava.service;

import java.math.*;

public final class Money {
  private Money() {}

  public static BigDecimal round(BigDecimal value) {
    return value.setScale(2, RoundingMode.HALF_UP);
  }

  public static void quantity(String unit, BigDecimal value) {
    if (value.signum() < 0
        || value.scale() > 3
        || ("UN".equals(unit) && value.stripTrailingZeros().scale() > 0))
      throw new BusinessException("Quantidade inválida para unidade " + unit);
  }

  public static BigDecimal line(BigDecimal price, BigDecimal quantity, BigDecimal discount) {
    if (price.signum() < 0 || quantity.signum() <= 0 || discount.signum() < 0)
      throw new BusinessException("Valores inválidos");
    var total = round(price.multiply(quantity)).subtract(discount);
    if (total.signum() < 0) throw new BusinessException("Desconto maior que o valor do item");
    return round(total);
  }

  public static void credit(BigDecimal balance, BigDecimal amount, BigDecimal limit) {
    if (amount.signum() <= 0 || balance.add(amount).compareTo(limit) > 0)
      throw new BusinessException("Limite de fiado excedido");
  }
}
