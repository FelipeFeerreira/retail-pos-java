package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "products")
public class Product {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Version public Long version;

  @Column(nullable = false, unique = true, length = 50)
  public String code;

  @Column(unique = true, length = 50)
  public String barcode;

  @Column(nullable = false, length = 160)
  public String name;

  @ManyToOne
  @JoinColumn(name = "category_id")
  public Category category;

  @Column(nullable = false, length = 2)
  public String unit;

  @Column(precision = 14, scale = 2, nullable = false)
  public BigDecimal price;

  @Column(precision = 14, scale = 2, nullable = false)
  public BigDecimal cost = BigDecimal.ZERO;

  @Column(precision = 14, scale = 3, nullable = false)
  public BigDecimal quantity = BigDecimal.ZERO;

  @Column(precision = 14, scale = 3, nullable = false)
  public BigDecimal minimumStock = BigDecimal.ZERO;

  public LocalDate expiresOn;

  /** Perishables must enter with an expiry lot and leave only from dated lots. */
  public boolean perishable;
  public boolean active = true;
}
