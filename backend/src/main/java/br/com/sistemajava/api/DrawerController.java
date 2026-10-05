package br.com.sistemajava.api;

import br.com.sistemajava.service.DrawerService;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/drawer")
public class DrawerController {
  private final DrawerService drawer;

  public DrawerController(DrawerService drawer) {
    this.drawer = drawer;
  }

  @PostMapping("/open")
  public Map<String, Boolean> open(@RequestBody(required = false) Map<String, String> input) {
    var reason = input == null ? null : input.get("reason");
    drawer.open(reason == null ? "Aberta pelo botão" : reason.substring(0, Math.min(120, reason.length())));
    return Map.of("opened", true);
  }
}
