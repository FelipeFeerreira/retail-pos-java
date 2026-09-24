package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "cash_movements")
public class CashMovement {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "session_id", nullable = false)
  @com.fasterxml.jackson.annotation.JsonIgnore
  public CashSession session;

  @Column(nullable = false)
  public Instant createdAt;

  @ManyToOne
  @JoinColumn(name = "user_id", nullable = false)
  public User user;

  @Column(length = 10)
  public String type;

  @Column(precision = 14, scale = 2)
  public BigDecimal amount;

  @Column(length = 255)
  public String reason;
}
