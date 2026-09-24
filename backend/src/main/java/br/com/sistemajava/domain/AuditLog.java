package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.time.*;

@Entity
@Table(name = "audit_log")
public class AuditLog {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  public Instant createdAt;

  @Column(length = 80)
  public String actor;

  @Column(length = 80)
  public String action;

  @Column(length = 80)
  public String entity;

  @Column(length = 80)
  public String entityId;

  @Column(columnDefinition = "text")
  public String details;
}
