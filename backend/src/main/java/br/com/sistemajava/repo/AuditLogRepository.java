package br.com.sistemajava.repo;

import br.com.sistemajava.domain.AuditLog;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {}
