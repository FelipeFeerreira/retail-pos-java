package br.com.sistemajava.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;
import org.springframework.web.cors.*;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  SecretKeySpec jwtKey(@Value("${app.jwt-secret}") String secret) {
    if (secret.getBytes(StandardCharsets.UTF_8).length < 32)
      throw new IllegalStateException("JWT_SECRET requires at least 32 bytes");
    return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
  }

  @Bean
  JwtEncoder jwtEncoder(SecretKeySpec key) {
    return new NimbusJwtEncoder(new ImmutableSecret<>(key));
  }

  @Bean
  JwtDecoder jwtDecoder(SecretKeySpec key) {
    var decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer("sistemajava"));
    return decoder;
  }

  @Bean
  JwtAuthenticationConverter authenticationConverter() {
    var authorities = new JwtGrantedAuthoritiesConverter();
    authorities.setAuthoritiesClaimName("roles");
    authorities.setAuthorityPrefix("ROLE_");
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(authorities);
    return converter;
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity http,
      JwtAuthenticationConverter converter,
      @Value("${app.require-https}") boolean https,
      @Value("${app.origin}") String origin)
      throws Exception {
    var csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrf.setCookieCustomizer(c -> c.sameSite("Strict").secure(https).path("/"));
    var handler = new CsrfTokenRequestAttributeHandler();
    http.cors(
        c ->
            c.configurationSource(
                request -> {
                  var config = new CorsConfiguration();
                  config.setAllowedOrigins(List.of(origin));
                  config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
                  config.setAllowedHeaders(
                      List.of("Authorization", "Content-Type", "X-XSRF-TOKEN"));
                  config.setAllowCredentials(true);
                  return config;
                }));
    http.csrf(c -> c.disable());
    var csrfFilter = new CsrfFilter(csrf);
    csrfFilter.setRequestHandler(handler);
    csrfFilter.setAccessDeniedHandler(
        (request, response, exception) -> {
          response.setStatus(403);
          response.setContentType("application/json");
          response.getWriter().write("{\"message\":\"CSRF token required\"}");
        });
    http.addFilterAt(csrfFilter, CsrfFilter.class);
    http.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(
        a ->
            a.requestMatchers(
                    "/api/v1/auth/csrf", "/api/v1/auth/login", "/actuator/health", "/ws/updates", "/error")
                .permitAll()
                .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**")
                .permitAll()
                .anyRequest()
                .authenticated());
    http.oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter)));
    http.headers(
        h ->
            h.contentTypeOptions(c -> {})
                .frameOptions(f -> f.deny())
                .contentSecurityPolicy(
                    c -> c.policyDirectives("default-src 'self'; frame-ancestors 'none'")));
    if (https) http.requiresChannel(c -> c.anyRequest().requiresSecure());
    return http.build();
  }
}
