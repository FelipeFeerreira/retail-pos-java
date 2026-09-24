package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "writeoff_items")
public class WriteoffItem {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "writeoff_id", nullable = false)
  @com.fasterxml.jackson.annotation.JsonIgnore
  public Writeoff writeoff;

  @ManyToOne
  @JoinColumn(name = "product_id", nullable = false)
  @com.fasterxml.jackson.annotation.JsonIgnore
  public Product product;

  @Column(length = 160)
  public String productName;

  @Column(length = 2)
  public String unit;

  @Column(precision = 14, scale = 3)
  public BigDecimal quantity;

  @Column(precision = 14, scale = 2)
  public BigDecimal unitCost;

  @Column(precision = 14, scale = 2)
  public BigDecimal total;

  public Long getProductId() {
    return product.id;
  }
}
