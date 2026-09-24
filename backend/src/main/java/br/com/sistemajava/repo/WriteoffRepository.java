package br.com.sistemajava.repo;

import br.com.sistemajava.domain.Writeoff;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface WriteoffRepository extends JpaRepository<Writeoff, Long> {
  Page<Writeoff> findByKind(String kind, Pageable page);
}
