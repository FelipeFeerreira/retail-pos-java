package br.com.sistemajava.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "settings")
public class Setting {
  @Id
  @Column(length = 80)
  public String id;

  @Column(nullable = false, columnDefinition = "text")
  public String value;

  public Setting() {}

  public Setting(String id, String value) {
    this.id = id;
    this.value = value;
  }
}
