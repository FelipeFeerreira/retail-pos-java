package br.com.sistemajava.config;

import br.com.sistemajava.service.BackupService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class MaintenanceFilter extends OncePerRequestFilter {
  private final BackupService backups;

  public MaintenanceFilter(BackupService backups) {
    this.backups = backups;
  }

  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (request.getRequestURI().startsWith("/api/v1/backup")
        || !request.getRequestURI().startsWith("/api/")) {
      chain.doFilter(request, response);
      return;
    }
    if (!backups.maintenance.readLock().tryLock()) {
      response.setStatus(503);
      response.setContentType("application/json");
      response.getWriter().write("{\"message\":\"Restauração em andamento\"}");
      return;
    }
    try {
      chain.doFilter(request, response);
    } finally {
      backups.maintenance.readLock().unlock();
    }
  }
}
