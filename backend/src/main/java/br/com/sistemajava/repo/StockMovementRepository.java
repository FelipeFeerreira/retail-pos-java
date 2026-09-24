package br.com.sistemajava.repo;

import br.com.sistemajava.domain.StockMovement;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {
  Page<StockMovement> findByProductIdOrderByCreatedAtDesc(Long productId, Pageable page);
}
