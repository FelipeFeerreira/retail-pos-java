package br.com.sistemajava.domain;

import jakarta.persistence.*;
import java.time.*;

@Entity
@Table(name = "users")
public class User {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(nullable = false, unique = true, length = 80)
  public String username;

  @com.fasterxml.jackson.annotation.JsonIgnore
  @Column(nullable = false)
  public String password;

  @Column(nullable = false, length = 10)
  public String role;

  public boolean active = true;
}
