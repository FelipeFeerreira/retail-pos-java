package br.com.sistemajava.api;

import br.com.sistemajava.service.CostService;
import br.com.sistemajava.service.ImportExportService;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/products")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class ImportExportController {
  private final ImportExportService service;
  private final CostService costs;
  private final ProductMapper mapper;

  public ImportExportController(
      ImportExportService service, CostService costs, ProductMapper mapper) {
    this.service = service;
    this.costs = costs;
    this.mapper = mapper;
  }

  @GetMapping("/costs/pending")
  public List<CostService.Pending> pendingCosts() {
    return costs.pending();
  }

  @GetMapping("/costs/template")
  public ResponseEntity<byte[]> costTemplate(@RequestParam(defaultValue = "true") boolean onlyMissing)
      throws IOException {
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=custos.xlsx")
        .contentType(
            MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(costs.template(onlyMissing));
  }

  @PostMapping("/costs/import")
  public CostService.ImportResult importCosts(@RequestParam MultipartFile file) throws IOException {
    return costs.importFile(file);
  }

  public record CostInput(BigDecimal cost) {}

  @PatchMapping("/{id}/cost")
  public Dtos.ProductView cost(@PathVariable Long id, @RequestBody CostInput input) {
    return mapper.toView(costs.setCost(id, input.cost()));
  }

  @PostMapping("/import")
  public Map<String, Integer> upload(@RequestParam MultipartFile file) throws IOException {
    return Map.of("imported", service.importFile(file));
  }

  @GetMapping("/export")
  public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "xlsx") String format)
      throws IOException {
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=produtos." + format)
        .contentType(
            MediaType.parseMediaType(
                format.equals("csv")
                    ? "text/csv"
                    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(service.export(format));
  }
}
