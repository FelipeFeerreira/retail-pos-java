package br.com.sistemajava.hardware;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/scale")
public class ScaleController {
  private final ScaleAdapter adapter;

  public ScaleController(ScaleAdapter adapter) {
    this.adapter = adapter;
  }

  @GetMapping("/weight")
  public ScaleAdapter.Weight weight() {
    return adapter.read();
  }
}
