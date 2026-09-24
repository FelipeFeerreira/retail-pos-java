package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "customers")
public class Customer {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Version public Long version;

  @Column(nullable = false, length = 160)
  public String name;

  @Column(unique = true, length = 30)
  public String document;

  @Column(length = 40)
  public String phone;

  @Column(precision = 14, scale = 2)
  public BigDecimal creditLimit = BigDecimal.ZERO;

  @Column(precision = 14, scale = 2)
  public BigDecimal balance = BigDecimal.ZERO;

  @Column(length = 255)
  public String address;

  @Column(length = 255)
  public String note;

  /** Credit policy overrides; null uses the store default (credit.* settings). */
  public Integer termDays;

  @Column(precision = 6, scale = 3)
  public BigDecimal interestDay;

  @Column(precision = 6, scale = 3)
  public BigDecimal penaltyDay;

  public boolean active = true;
}
