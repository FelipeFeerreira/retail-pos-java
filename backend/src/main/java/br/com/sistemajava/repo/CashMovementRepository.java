package br.com.sistemajava.repo;

import br.com.sistemajava.domain.CashMovement;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface CashMovementRepository extends JpaRepository<CashMovement, Long> {
  List<CashMovement> findBySessionIdOrderById(Long sessionId);
}
