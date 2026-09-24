package br.com.sistemajava.repo;

import br.com.sistemajava.domain.PriceRule;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface PriceRuleRepository extends JpaRepository<PriceRule, Long> {
  @Query(
      "select r from PriceRule r where r.product.id=:id and r.tableName=:table and r.startsAt<=:now"
          + " and r.endsAt>:now order by r.startsAt desc,r.id desc")
  List<PriceRule> active(
      @Param("id") Long id, @Param("table") String table, @Param("now") Instant now, Pageable page);
}
