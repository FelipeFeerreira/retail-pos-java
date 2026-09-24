package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "credits")
public class Credit {
  @Column(unique=true) public UUID paymentRequestId;
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "customer_id", nullable = false)
  public Customer customer;

  @ManyToOne
  @JoinColumn(name = "sale_id")
  public Sale sale;

  @ManyToOne
  @JoinColumn(name = "user_id", nullable = false)
  public User user;

  public Instant createdAt;
  public LocalDate dueDate;

  @Column(precision = 14, scale = 2)
  public BigDecimal amount;

  @Column(precision = 14, scale = 2)
  public BigDecimal remaining;

  @Column(length = 255)
  public String description;

  /** Simple daily interest and penalty (% of the open principal) after the due date. */
  @Column(precision = 6, scale = 3)
  public BigDecimal interestDay = BigDecimal.ZERO;

  @Column(precision = 6, scale = 3)
  public BigDecimal penaltyDay = BigDecimal.ZERO;

  /** On payments: how the customer paid and the charges collected on top of the principal. */
  @Column(length = 12)
  public String method;

  @Column(precision = 14, scale = 2)
  public BigDecimal charges = BigDecimal.ZERO;

  public Long cashSessionId;
}
