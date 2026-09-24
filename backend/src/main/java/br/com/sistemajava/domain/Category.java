package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.time.*;

@Entity
@Table(name = "categories")
public class Category {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(nullable = false, unique = true, length = 100)
  public String name;

  /** Markup over cost (%) for suggested prices; null uses the store default. */
  @Column(precision = 7, scale = 2)
  public java.math.BigDecimal markup;
}
