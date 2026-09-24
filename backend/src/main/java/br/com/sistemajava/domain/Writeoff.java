package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

/** Stock that left without a sale: a loss (thrown away) or internal consumption, at cost. */
@Entity
@Table(name = "writeoffs")
public class Writeoff {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(length = 8)
  public String kind;

  @Column(length = 80)
  public String reason;

  @Column(length = 255)
  public String note = "";

  public Instant createdAt;

  @ManyToOne
  @JoinColumn(name = "user_id", nullable = false)
  public User user;

  @Column(precision = 14, scale = 2)
  public BigDecimal totalCost = BigDecimal.ZERO;

  @OneToMany(mappedBy = "writeoff")
  @OrderBy("id")
  public List<WriteoffItem> items = new ArrayList<>();
}
