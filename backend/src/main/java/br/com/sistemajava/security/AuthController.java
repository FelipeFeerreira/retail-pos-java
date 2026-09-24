package br.com.sistemajava.security;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.repo.UserRepository;
import br.com.sistemajava.service.AuditService;
import jakarta.validation.Valid;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
  private final UserRepository users;
  private final PasswordEncoder passwords;
  private final JwtEncoder encoder;
  private final AuditService audit;
  private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();
  private final String dummy;

  private record Attempts(int count, Instant until) {}

  public AuthController(
      UserRepository users, PasswordEncoder passwords, JwtEncoder encoder, AuditService audit) {
    this.users = users;
    this.passwords = passwords;
    this.encoder = encoder;
    this.audit = audit;
    dummy = passwords.encode(UUID.randomUUID().toString());
  }

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken());
  }

  @PostMapping("/login")
  public synchronized ResponseEntity<?> login(@Valid @RequestBody Dtos.Login input) {
    var now = Instant.now();
    attempts.entrySet().removeIf(e -> e.getValue().until().isBefore(now));
    if (attempts.size() > 10000)
      return ResponseEntity.status(429).body(Map.of("message", "Aguarde para tentar novamente"));
    var key = input.username().toLowerCase(Locale.ROOT);
    var attempt = attempts.get(key);
    if (attempt != null && attempt.count() >= 10)
      return ResponseEntity.status(429)
          .body(Map.of("message", "Muitas tentativas. Aguarde 15 minutos."));
    var user = users.findByUsername(input.username()).orElse(null);
    boolean valid = passwords.matches(input.password(), user == null ? dummy : user.password);
    if (!valid || user == null || !user.active) {
      attempts.put(
          key,
          new Attempts(
              attempt == null ? 1 : attempt.count() + 1,
              attempt == null ? now.plusSeconds(900) : attempt.until()));
      return ResponseEntity.status(401).body(Map.of("message", "Usuário ou senha inválidos"));
    }
    attempts.remove(key);
    var claims =
        JwtClaimsSet.builder()
            .issuer("sistemajava")
            .subject(user.username)
            .issuedAt(now)
            .expiresAt(now.plusSeconds(3600))
            .claim("roles", List.of(user.role))
            .build();
    var token =
        encoder
            .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
            .getTokenValue();
    audit.recordAs(user.username, "LOGIN", "users", user.id, "Login bem-sucedido");
    return ResponseEntity.ok(
        Map.of("token", token, "username", user.username, "role", user.role, "expiresIn", 3600));
  }
}
