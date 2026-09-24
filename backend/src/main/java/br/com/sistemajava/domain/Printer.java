package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.time.*;

@Entity
@Table(name = "printers")
public class Printer {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(length = 100)
  public String name;

  @Column(length = 20)
  public String connection;

  @Column(length = 255)
  public String address;
}
