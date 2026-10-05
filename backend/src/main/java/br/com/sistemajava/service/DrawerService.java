package br.com.sistemajava.service;

import br.com.sistemajava.repo.SettingRepository;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Collection;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Gaveta de dinheiro ligada no conector da impressora térmica. Com a impressora em rede (porta
 * RAW 9100), o comando ESC/POS "ESC p" é enviado direto para ela. Impressora só em USB fica a
 * cargo do driver do Windows.
 */
@Service
public class DrawerService {
  private static final Logger log = LoggerFactory.getLogger(DrawerService.class);
  private final SettingRepository settings;
  private final AuditService audit;

  public DrawerService(SettingRepository settings, AuditService audit) {
    this.settings = settings;
    this.audit = audit;
  }

  private String setting(String key, String fallback) {
    return settings.findById(key).map(s -> s.value).filter(v -> !v.isBlank()).orElse(fallback);
  }

  /** Abre agora; lança BusinessException se a impressora não responder. */
  public void open(String reason) {
    if (!"network".equals(setting("drawer.mode", "off")))
      throw new BusinessException("Gaveta não configurada para impressora em rede");
    send();
    audit.record("OPEN", "drawer", null, reason == null ? "" : reason);
  }

  /** Depois de gravar a venda, abre a gaveta conforme "Abrir sozinha"; falha só vai para o log. */
  public void afterSale(Long saleId, Collection<String> methods) {
    if (!"network".equals(setting("drawer.mode", "off"))) return;
    var auto = setting("drawer.auto", "cash");
    if (auto.equals("never") || (auto.equals("cash") && !methods.contains("CASH"))) return;
    var auth = SecurityContextHolder.getContext().getAuthentication();
    var actor = auth == null ? "system" : auth.getName();
    Runnable task =
        () -> {
          try {
            send();
            audit.recordAs(actor, "OPEN", "drawer", saleId, "Venda #" + saleId);
          } catch (RuntimeException ex) {
            log.warn("Gaveta não abriu na venda {}: {}", saleId, ex.getMessage());
          }
        };
    if (TransactionSynchronizationManager.isSynchronizationActive())
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            @Override
            public void afterCommit() {
              CompletableFuture.runAsync(task);
            }
          });
    else CompletableFuture.runAsync(task);
  }

  private void send() {
    var host = setting("drawer.host", "");
    if (host.isBlank()) throw new BusinessException("Informe o IP da impressora");
    int port = Integer.parseInt(setting("drawer.port", "9100"));
    int pin = Integer.parseInt(setting("drawer.pin", "0"));
    // ESC p m t1 t2: pulso no pino 2 (m=0) ou 5 (m=1), 50 ms ligado / 500 ms desligado.
    byte[] command = {0x1B, 0x70, (byte) pin, 0x19, (byte) 0xFA};
    try (var socket = new Socket()) {
      socket.connect(new InetSocketAddress(host, port), 3000);
      socket.setSoTimeout(3000);
      socket.getOutputStream().write(command);
      socket.getOutputStream().flush();
    } catch (IOException ex) {
      throw new BusinessException(
          "Impressora não respondeu em " + host + ":" + port + " (" + ex.getMessage() + ")");
    }
  }
}
