package br.com.sistemajava.repo;

import br.com.sistemajava.domain.WriteoffItem;
import org.springframework.data.jpa.repository.*;

public interface WriteoffItemRepository extends JpaRepository<WriteoffItem, Long> {}
