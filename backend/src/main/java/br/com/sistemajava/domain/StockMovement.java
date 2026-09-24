package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "stock_movements")
public class StockMovement {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne
  @JoinColumn(name = "product_id", nullable = false)
  public Product product;

  @ManyToOne
  @JoinColumn(name = "sale_id")
  public Sale sale;

  @ManyToOne
  @JoinColumn(name = "user_id", nullable = false)
  public User user;

  public Instant createdAt;

  @Column(length = 12)
  public String type;

  @Column(precision = 14, scale = 3)
  public BigDecimal quantity;

  @Column(length = 255)
  public String reason;
}
