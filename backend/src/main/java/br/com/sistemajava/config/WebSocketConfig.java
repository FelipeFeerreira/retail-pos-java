package br.com.sistemajava.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.config.*;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
  private final String origin;
  private final JwtDecoder decoder;
  private final JwtAuthenticationConverter converter;

  public WebSocketConfig(
      @Value("${app.origin}") String origin,
      JwtDecoder decoder,
      JwtAuthenticationConverter converter) {
    this.origin = origin;
    this.decoder = decoder;
    this.converter = converter;
  }

  public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry.addEndpoint("/ws/updates").setAllowedOrigins(origin);
  }

  public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.enableSimpleBroker("/topic");
  }

  public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(
        new ChannelInterceptor() {
          public Message<?> preSend(Message<?> message, MessageChannel channel) {
            var headers = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
            if (headers == null) throw new AccessDeniedException("Invalid message");
            if (StompCommand.CONNECT.equals(headers.getCommand())) {
              String header = headers.getFirstNativeHeader("Authorization");
              if (header == null || !header.startsWith("Bearer "))
                throw new AccessDeniedException("JWT required");
              headers.setUser(converter.convert(decoder.decode(header.substring(7))));
            } else if (StompCommand.SUBSCRIBE.equals(headers.getCommand())) {
              if (headers.getUser() == null || !"/topic/updates".equals(headers.getDestination()))
                throw new AccessDeniedException("Forbidden subscription");
              var auth =
                  (org.springframework.security.oauth2.server.resource.authentication
                          .JwtAuthenticationToken)
                      headers.getUser();
              if (auth.getToken().getExpiresAt().isBefore(java.time.Instant.now()))
                throw new AccessDeniedException("Expired JWT");
            } else if (StompCommand.SEND.equals(headers.getCommand()))
              throw new AccessDeniedException("Read only");
            return message;
          }
        });
  }
}
