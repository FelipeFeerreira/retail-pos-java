package br.com.sistemajava.service;

import java.util.Map;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

@Component
public class Updates {
  public record Event(String type) {}

  private final ApplicationEventPublisher events;
  private final SimpMessagingTemplate messaging;

  public Updates(ApplicationEventPublisher events, SimpMessagingTemplate messaging) {
    this.events = events;
    this.messaging = messaging;
  }

  public void publish(String type) {
    events.publishEvent(new Event(type));
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void send(Event event) {
    messaging.convertAndSend("/topic/updates", Map.of("type", event.type()));
  }
}
