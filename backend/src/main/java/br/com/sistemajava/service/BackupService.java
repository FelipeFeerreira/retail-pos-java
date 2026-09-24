package br.com.sistemajava.service;

import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class BackupService {
  public final ReentrantReadWriteLock maintenance = new ReentrantReadWriteLock(true);
  private final Path directory;
  private final String url, username, password;
  private final int retention;
  private final AuditService audit;
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(BackupService.class);

  public BackupService(
      @Value("${app.backup-directory}") String directory,
      @Value("${spring.datasource.url}") String url,
      @Value("${spring.datasource.username}") String username,
      @Value("${spring.datasource.password}") String password,
      @Value("${app.backup-retention-days}") int retention,
      AuditService audit) {
    this.directory = Path.of(directory).toAbsolutePath().normalize();
    this.url = url;
    this.username = username;
    this.password = password;
    this.retention = retention;
    this.audit = audit;
    if (retention < 1) throw new IllegalArgumentException("Backup retention must be positive");
  }

  public List<Map<String, Object>> list() throws IOException {
    Files.createDirectories(directory);
    try (var paths = Files.list(directory)) {
      return paths
          .filter(p -> p.getFileName().toString().matches("backup-[0-9TZ-]+[.]dump"))
          .sorted(Comparator.reverseOrder())
          .map(
              p -> {
                try {
                  return Map.<String, Object>of(
                      "filename",
                      p.getFileName().toString(),
                      "bytes",
                      Files.size(p),
                      "createdAt",
                      Files.getLastModifiedTime(p).toInstant().toString());
                } catch (IOException e) {
                  throw new java.io.UncheckedIOException(e);
                }
              })
          .toList();
    }
  }

  public synchronized String create() throws IOException, InterruptedException {
    Files.createDirectories(directory);
    var name =
        "backup-"
            + DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmssSSS'Z'")
                .withZone(ZoneOffset.UTC)
                .format(Instant.now())
            + ".dump";
    var target = directory.resolve(name);
    var partial = directory.resolve(name + ".partial");
    try {
      run("pg_dump", List.of("--format=custom", "--no-owner", "--no-acl", "--file=" + partial));
      Files.move(partial, target);
    } finally {
      Files.deleteIfExists(partial);
    }
    audit.record("BACKUP", "backup", name, "Backup criado");
    return name;
  }

  public synchronized void restore(String filename, String confirmation)
      throws IOException, InterruptedException {
    if (!"RESTAURAR".equals(confirmation))
      throw new BusinessException("Digite RESTAURAR para confirmar");
    if (!filename.matches("backup-[0-9TZ-]+[.]dump"))
      throw new BusinessException("Arquivo inválido");
    var file = directory.resolve(filename).normalize();
    if (!file.getParent().equals(directory)
        || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS))
      throw new BusinessException("Backup não encontrado");
    maintenance.writeLock().lock();
    try {
      create(); // Safety snapshot must succeed before altering the database.
      run(
          "pg_restore",
          List.of(
              "--clean",
              "--if-exists",
              "--single-transaction",
              "--no-owner",
              "--no-acl",
              file.toString()));
      audit.record("RESTORE", "backup", filename, "Restauração concluída");
    } finally {
      maintenance.writeLock().unlock();
    }
  }

  private void run(String executable, List<String> args) throws IOException, InterruptedException {
    var uri = URI.create(url.substring("jdbc:".length()));
    var command = new ArrayList<String>();
    command.add(executable);
    command.add("--host=" + uri.getHost());
    command.add("--port=" + (uri.getPort() < 0 ? 5432 : uri.getPort()));
    command.add("--username=" + username);
    command.add("--dbname=" + uri.getPath().substring(1));
    command.addAll(args);
    var output = Files.createTempFile(directory, "process-", ".log");
    try {
      var builder =
          new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(output.toFile());
      builder.environment().put("PGPASSWORD", password);
      builder.environment().put("PGCONNECT_TIMEOUT", "10");
      var process = builder.start();
      try {
        if (!process.waitFor(10, TimeUnit.MINUTES)) {
          process.destroyForcibly();
          throw new BusinessException("Operação de backup excedeu 10 minutos");
        }
        if (process.exitValue() != 0) {
          log.error("PostgreSQL backup command failed: {}", Files.readString(output));
          throw new BusinessException(
              "Falha no utilitário PostgreSQL. Consulte o log do servidor.");
        }
      } catch (InterruptedException e) {
        process.destroyForcibly();
        Thread.currentThread().interrupt();
        throw e;
      }
    } finally {
      Files.deleteIfExists(output);
    }
  }

  @Scheduled(cron = "${app.backup-cron}", zone = "${app.zone}")
  public void daily() {
    try {
      create();
      try (var paths = Files.list(directory)) {
        for (var file :
            paths
                .filter(p -> p.getFileName().toString().matches("backup-[0-9TZ-]+[.]dump"))
                .toList()) {
          if (Files.getLastModifiedTime(file)
              .toInstant()
              .isBefore(Instant.now().minus(Duration.ofDays(retention)))) Files.delete(file);
        }
      }
    } catch (Exception ex) {
      log.error("Automatic backup failed", ex);
    }
  }
}
