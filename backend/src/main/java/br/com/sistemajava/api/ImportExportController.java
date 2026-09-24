package br.com.sistemajava.api;

import br.com.sistemajava.service.ImportExportService;
import java.io.IOException;
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

  public ImportExportController(ImportExportService service) {
    this.service = service;
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
