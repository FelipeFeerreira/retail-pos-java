package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Product;
import jakarta.persistence.LockModeType;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {
  @Query(
      "select p from Product p where p.active=true and (:q='' or lower(p.name) like"
          + " lower(concat('%',:q,'%')) or p.code=:q or p.barcode=:q) order by p.name")
  Page<Product> search(@Param("q") String q, Pageable page);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from Product p where p.id=:id")
  Optional<Product> lock(@Param("id") Long id);

  Optional<Product> findByCode(String code);

  @Query(
      "select p from Product p where p.active=true and (p.quantity<=p.minimumStock or"
          + " p.expiresOn<=:date)")
  List<Product> alerts(@Param("date") LocalDate date);
}
