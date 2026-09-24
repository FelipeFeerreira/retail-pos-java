package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "price_rules")
public class PriceRule {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "product_id", nullable = false)
  public Product product;

  @Column(length = 50)
  public String tableName;

  @Column(precision = 14, scale = 2)
  public BigDecimal price;

  public Instant startsAt;
  public Instant endsAt;
}
