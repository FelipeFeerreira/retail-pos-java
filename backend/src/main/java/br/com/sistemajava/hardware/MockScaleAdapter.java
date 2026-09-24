package br.com.sistemajava.hardware;

import java.math.BigDecimal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.scale-mode", havingValue = "mock", matchIfMissing = true)
public class MockScaleAdapter implements ScaleAdapter {
  public Weight read() {
    return new Weight(new BigDecimal("0.750"), true, true);
  }
}
