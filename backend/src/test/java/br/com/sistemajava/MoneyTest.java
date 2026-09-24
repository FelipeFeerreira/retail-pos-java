package br.com.sistemajava;

import static org.junit.jupiter.api.Assertions.*;

import br.com.sistemajava.service.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;

class MoneyTest {
  @ParameterizedTest
  @CsvSource({"6.99,0.750,0,5.24", "24.90,3,2,72.70", "0.01,0.500,0,0.01", "2.50,2,5,0.00"})
  void roundsLineBeforeSubtractingDiscount(
      String price, String quantity, String discount, String expected) {
    assertEquals(
        new BigDecimal(expected),
        Money.line(new BigDecimal(price), new BigDecimal(quantity), new BigDecimal(discount)));
  }

  @ParameterizedTest
  @CsvSource({"-1,1,0", "1,0,0", "1,-1,0", "1,1,-1", "1,1,2"})
  void rejectsInvalidMoney(String price, String quantity, String discount) {
    assertThrows(
        BusinessException.class,
        () ->
            Money.line(new BigDecimal(price), new BigDecimal(quantity), new BigDecimal(discount)));
  }

  @ParameterizedTest
  @CsvSource({"UN,1.5", "KG,-1", "KG,0.0001"})
  void rejectsInvalidQuantities(String unit, String quantity) {
    assertThrows(BusinessException.class, () -> Money.quantity(unit, new BigDecimal(quantity)));
  }

  @ParameterizedTest
  @CsvSource({"UN,1.000", "KG,0.001", "KG,1.750", "UN,0"})
  void acceptsQuantities(String unit, String quantity) {
    assertDoesNotThrow(() -> Money.quantity(unit, new BigDecimal(quantity)));
  }

  @Test
  void creditAllowsExactLimit() {
    assertDoesNotThrow(
        () -> Money.credit(new BigDecimal("90"), new BigDecimal("10"), new BigDecimal("100")));
  }

  @Test
  void creditRejectsExceededLimit() {
    assertThrows(
        BusinessException.class,
        () -> Money.credit(new BigDecimal("90"), new BigDecimal("10.01"), new BigDecimal("100")));
  }

  @Test
  void creditRejectsNegativePayment() {
    assertThrows(
        BusinessException.class,
        () -> Money.credit(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.TEN));
  }
}
