package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Credit;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CreditRepository extends JpaRepository<Credit, Long> {
  Optional<Credit> findByPaymentRequestId(UUID requestId);
  List<Credit> findByCustomerIdOrderByCreatedAtDesc(Long customerId);

  @Query("select c from Credit c where c.customer.id=:id and c.remaining>0 order by c.dueDate,c.id")
  List<Credit> unpaid(@Param("id") Long id);

  List<Credit> findBySaleId(Long saleId);

  @Query("select c from Credit c where c.remaining>0 and c.dueDate<:date order by c.dueDate")
  List<Credit> overdue(@Param("date") LocalDate date);
}
