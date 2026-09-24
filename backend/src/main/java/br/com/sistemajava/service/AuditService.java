package br.com.sistemajava.service;

import br.com.sistemajava.domain.AuditLog;
import br.com.sistemajava.repo.AuditLogRepository;
import java.time.Instant;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {
  private final AuditLogRepository logs;

  public AuditService(AuditLogRepository logs) {
    this.logs = logs;
  }

  @Transactional
  public void record(String action, String entity, Object id, String details) {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    recordAs(auth == null ? "system" : auth.getName(), action, entity, id, details);
  }

  @Transactional
  public void recordAs(String actor, String action, String entity, Object id, String details) {
    var log = new AuditLog();
    log.createdAt = Instant.now();
    log.actor = actor;
    log.action = action;
    log.entity = entity;
    log.entityId = id == null ? null : id.toString();
    log.details = details;
    logs.save(log);
  }
}
