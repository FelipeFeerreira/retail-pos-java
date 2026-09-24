package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

@Component
public class RequestFingerprint {
  private final ObjectMapper mapper;

  public RequestFingerprint(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public String hash(Dtos.SaleInput input) {
    try {
      return HexFormat.of()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(input)));
    } catch (Exception ex) {
      throw new IllegalStateException("Cannot fingerprint sale", ex);
    }
  }
}
