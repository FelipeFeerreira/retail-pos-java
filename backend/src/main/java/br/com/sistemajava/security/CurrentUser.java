package br.com.sistemajava.security;

import br.com.sistemajava.domain.User;
import br.com.sistemajava.repo.UserRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentUser {
  private final UserRepository users;

  public CurrentUser(UserRepository users) {
    this.users = users;
  }

  public User get() {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth == null) throw new AccessDeniedException("Authentication required");
    return users
        .findByUsername(auth.getName())
        .filter(u -> u.active)
        .orElseThrow(() -> new AccessDeniedException("User disabled"));
  }

  public boolean manager() {
    return !get().role.equals("CASHIER");
  }
}
