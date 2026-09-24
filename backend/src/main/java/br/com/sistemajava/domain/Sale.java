package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "sales")
public class Sale {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(nullable = false, unique = true)
  public UUID requestId;

  @Column(length = 64)
  public String requestHash;

  @Column(nullable = false)
  public Instant createdAt;

  @ManyToOne
  @JoinColumn(name = "user_id", nullable = false)
  public User user;

  @ManyToOne
  @JoinColumn(name = "customer_id")
  public Customer customer;

  @ManyToOne
  @JoinColumn(name = "cash_session_id")
  @com.fasterxml.jackson.annotation.JsonIgnore
  public CashSession cashSession;

  @Column(precision = 14, scale = 2)
  public BigDecimal total;

  @Column(precision = 14, scale = 2)
  public BigDecimal fees = BigDecimal.ZERO;

  @Column(length = 10)
  public String status = "COMPLETED";
}
