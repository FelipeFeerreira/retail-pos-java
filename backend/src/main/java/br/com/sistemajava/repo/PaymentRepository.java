package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Payment;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
  List<Payment> findBySaleId(Long saleId);
}
