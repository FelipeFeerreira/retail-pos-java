package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Sale;
import jakarta.persistence.LockModeType;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface SaleRepository extends JpaRepository<Sale, Long> {
  Optional<Sale> findByRequestId(UUID requestId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from Sale s where s.id=:id")
  Optional<Sale> lock(@Param("id") Long id);
}
