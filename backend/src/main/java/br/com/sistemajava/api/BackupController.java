package br.com.sistemajava.api;

import br.com.sistemajava.service.BackupService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/backup")
@PreAuthorize("hasRole('ADMIN')")
public class BackupController {
  private final BackupService backups;

  public BackupController(BackupService backups) {
    this.backups = backups;
  }

  @GetMapping
  public List<Map<String, Object>> list() throws IOException {
    return backups.list();
  }

  @PostMapping
  public Map<String, String> create() throws IOException, InterruptedException {
    return Map.of("filename", backups.create());
  }

  @PostMapping("/restore")
  public Map<String, String> restore(@Valid @RequestBody Dtos.RestoreInput input)
      throws IOException, InterruptedException {
    backups.restore(input.filename(), input.confirmation());
    return Map.of("message", "Backup restaurado");
  }
}
