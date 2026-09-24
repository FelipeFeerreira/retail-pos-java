package br.com.sistemajava.api;

import br.com.sistemajava.service.BusinessException;
import jakarta.persistence.EntityNotFoundException;
import java.util.Map;
import org.springframework.dao.*;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class Errors {
  @ExceptionHandler(BusinessException.class)
  ResponseEntity<?> business(BusinessException ex) {
    return ResponseEntity.unprocessableEntity().body(Map.of("message", ex.getMessage()));
  }

  @ExceptionHandler(EntityNotFoundException.class)
  ResponseEntity<?> missing(EntityNotFoundException ex) {
    return ResponseEntity.status(404).body(Map.of("message", "Registro não encontrado"));
  }

  @ExceptionHandler({
    DataIntegrityViolationException.class,
    OptimisticLockingFailureException.class,
    CannotAcquireLockException.class
  })
  ResponseEntity<?> conflict(Exception ex) {
    return ResponseEntity.status(409)
        .body(
            Map.of(
                "message",
                "Conflito: código duplicado, registro em uso ou alteração simultânea. Atualize e"
                    + " tente novamente."));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "message",
                "Dados inválidos",
                "errors",
                ex.getBindingResult().getFieldErrors().stream()
                    .map(e -> e.getField() + ": " + e.getDefaultMessage())
                    .toList()));
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.http.converter.HttpMessageNotReadableException.class
  })
  ResponseEntity<?> invalid(Exception ex) {
    return ResponseEntity.badRequest().body(Map.of("message", "Requisição inválida"));
  }
}
