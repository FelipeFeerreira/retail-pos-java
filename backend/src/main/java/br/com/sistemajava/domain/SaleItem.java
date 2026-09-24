package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "sale_items")
public class SaleItem {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "sale_id", nullable = false)
  @com.fasterxml.jackson.annotation.JsonIgnore
  public Sale sale;

  @ManyToOne
  @JoinColumn(name = "product_id", nullable = false)
  public Product product;

  @Column(length = 160)
  public String productName;

  @Column(length = 2)
  public String unit;

  @Column(precision = 14, scale = 3)
  public BigDecimal quantity;

  @Column(precision = 14, scale = 2)
  public BigDecimal unitPrice;

  @Column(precision = 14, scale = 2)
  public BigDecimal cost;

  @Column(precision = 14, scale = 2)
  public BigDecimal discount;

  @Column(precision = 14, scale = 2)
  public BigDecimal total;
}
