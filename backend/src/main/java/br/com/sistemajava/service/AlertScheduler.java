package br.com.sistemajava.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AlertScheduler {
  private final Updates updates;

  public AlertScheduler(Updates updates) {
    this.updates = updates;
  }

  @Scheduled(fixedDelay = 3600000)
  @Transactional
  public void alerts() {
    updates.publish("alerts");
  }
}
