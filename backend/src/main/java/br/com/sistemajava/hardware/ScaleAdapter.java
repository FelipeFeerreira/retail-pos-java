package br.com.sistemajava.hardware;

import java.math.BigDecimal;

public interface ScaleAdapter {
  record Weight(BigDecimal kilograms, boolean stable, boolean simulated) {}

  Weight read();
}
