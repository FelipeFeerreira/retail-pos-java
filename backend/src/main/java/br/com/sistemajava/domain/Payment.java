package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "payments")
public class Payment {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "sale_id", nullable = false)
  @com.fasterxml.jackson.annotation.JsonIgnore
  public Sale sale;

  @Column(length = 12)
  public String method;

  @Column(precision = 14, scale = 2)
  public BigDecimal amount;

  @Column(precision = 14, scale = 2)
  public BigDecimal fee;
}
