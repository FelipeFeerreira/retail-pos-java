package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.time.*;

@Entity
@Table(name = "scales")
public class Scale {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(length = 100)
  public String name;

  @Column(length = 100)
  public String port;

  @Column(length = 50)
  public String protocol;
}
