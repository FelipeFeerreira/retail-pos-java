package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "cash_sessions")
public class CashSession {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "user_id", nullable = false)
  public User user;

  @Column(nullable = false)
  public Instant openedAt;

  @Column(precision = 14, scale = 2)
  public BigDecimal openingAmount;

  @Column(length = 6)
  public String status = "OPEN";

  public Instant closedAt;

  @ManyToOne
  @JoinColumn(name = "closed_by")
  public User closedBy;

  @Column(precision = 14, scale = 2)
  public BigDecimal expectedCash;

  @Column(precision = 14, scale = 2)
  public BigDecimal countedCash;

  @Column(precision = 14, scale = 2)
  public BigDecimal difference;

  @Column(length = 255)
  public String notes;
}
