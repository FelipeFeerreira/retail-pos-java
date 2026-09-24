package br.com.sistemajava.security;

import br.com.sistemajava.domain.User;
import br.com.sistemajava.repo.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class Bootstrap implements ApplicationRunner {
  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final String password;

  public Bootstrap(
      UserRepository users,
      PasswordEncoder encoder,
      @Value("${app.admin-password}") String password) {
    this.users = users;
    this.encoder = encoder;
    this.password = password;
  }

  @Transactional
  public void run(ApplicationArguments args) {
    if (password.length() < 8 || password.length() > 72)
      throw new IllegalStateException("ADMIN_PASSWORD requires 8 to 72 characters");
    if (users.findByUsername("admin").isEmpty()) {
      var user = new User();
      user.username = "admin";
      user.password = encoder.encode(password);
      user.role = "ADMIN";
      users.save(user);
    }
  }
}
