package br.com.sistemajava.repo;

import br.com.sistemajava.domain.CashSession;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CashSessionRepository extends JpaRepository<CashSession, Long> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from CashSession c where c.id=:id")
  Optional<CashSession> lock(@Param("id") Long id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from CashSession c where c.user.id=:userId and c.status='OPEN'")
  Optional<CashSession> lockOpen(@Param("userId") Long userId);

  @Query("select c from CashSession c where c.user.id=:userId and c.status='OPEN'")
  Optional<CashSession> findOpen(@Param("userId") Long userId);

  Page<CashSession> findByUserId(Long userId, Pageable page);
}
