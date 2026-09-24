package br.com.sistemajava.service;

public class BusinessException extends RuntimeException {
  public BusinessException(String message) {
    super(message);
  }
}
