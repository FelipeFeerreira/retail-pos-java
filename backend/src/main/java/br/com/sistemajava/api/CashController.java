package br.com.sistemajava.api;

import br.com.sistemajava.domain.CashSession;
import br.com.sistemajava.service.CashService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cash")
public class CashController {
  private final CashService service;

  public CashController(CashService service) {
    this.service = service;
  }

  /** The signed-in operator's open drawer, or 204 when the drawer is closed. */
  @GetMapping("/current")
  public ResponseEntity<CashService.Summary> current() {
    return service
        .currentSummary()
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.noContent().build());
  }

  @PostMapping("/open")
  public CashService.Summary open(@Valid @RequestBody Dtos.CashOpen input) {
    return service.open(input);
  }

  @GetMapping("/sessions")
  public Page<CashSession> list(@RequestParam(defaultValue = "0") int page) {
    return service.list(page);
  }

  @GetMapping("/sessions/{id}")
  public CashService.Summary summary(@PathVariable Long id) {
    return service.summary(id);
  }

  @PostMapping("/sessions/{id}/movements")
  public CashService.Summary movement(
      @PathVariable Long id, @Valid @RequestBody Dtos.CashMovementInput input) {
    return service.movement(id, input);
  }

  @PostMapping("/sessions/{id}/close")
  public CashService.Summary close(
      @PathVariable Long id, @Valid @RequestBody Dtos.CashClose input) {
    return service.close(id, input);
  }
}
