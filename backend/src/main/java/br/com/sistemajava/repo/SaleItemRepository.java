package br.com.sistemajava.repo;

import br.com.sistemajava.domain.SaleItem;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface SaleItemRepository extends JpaRepository<SaleItem, Long> {
  List<SaleItem> findBySaleIdOrderById(Long saleId);
}
