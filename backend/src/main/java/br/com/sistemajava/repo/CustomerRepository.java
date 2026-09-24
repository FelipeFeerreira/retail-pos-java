package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Customer;
import jakarta.persistence.LockModeType;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CustomerRepository extends JpaRepository<Customer, Long> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Customer c where c.id=:id")
  Optional<Customer> lock(@Param("id") Long id);

  @Query(
      "select c from Customer c where c.active=true and lower(c.name) like"
          + " lower(concat('%',:q,'%')) order by c.name")
  Page<Customer> search(@Param("q") String q, Pageable page);
}
