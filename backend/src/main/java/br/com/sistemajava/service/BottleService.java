package br.com.sistemajava.service;

import br.com.sistemajava.security.CurrentUser;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Returnable bottles lent to customers, counted like fiado but in bottles instead of money. */
@Service
public class BottleService {
  private final JdbcTemplate jdbc;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;

  public BottleService(
      JdbcTemplate jdbc, CurrentUser current, AuditService audit, Updates updates) {
    this.jdbc = jdbc;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
  }

  /** TAKEN raises what the customer owes; RETURNED lowers it and may leave a credit. */
  @Transactional
  public void register(Long customerId, String type, int quantity, String direction, String note) {
    if (quantity <= 0) throw new BusinessException("Informe uma quantidade maior que zero");
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM customers WHERE id=? AND active=true)",
            Boolean.class,
            customerId))) throw new BusinessException("Cliente não encontrado");
    var bottle = type == null || type.isBlank() ? "Coca" : type.trim();
    var signed = direction.equals("TAKEN") ? quantity : -quantity;
    jdbc.update(
        "INSERT INTO bottle_movements(customer_id,bottle_type,quantity,note,created_at,user_id)"
            + " VALUES(?,?,?,?,now(),?)",
        customerId,
        bottle,
        signed,
        note == null ? "" : note.trim(),
        current.get().id);
    audit.record("BOTTLE", "customers", customerId, bottle + " " + signed);
    updates.publish("bottles");
  }

  public Map<String, Object> customer(Long customerId) {
    return Map.of(
        "balances",
        jdbc.queryForList(
            "SELECT bottle_type AS type,sum(quantity) AS balance FROM bottle_movements WHERE"
                + " customer_id=? GROUP BY bottle_type HAVING sum(quantity)<>0 ORDER BY"
                + " bottle_type",
            customerId),
        "history",
        jdbc.queryForList(
            "SELECT m.id,m.bottle_type AS type,m.quantity,m.note,m.created_at AS \"createdAt\","
                + "u.username FROM bottle_movements m JOIN users u ON u.id=m.user_id WHERE"
                + " m.customer_id=? ORDER BY m.created_at DESC LIMIT 200",
            customerId));
  }

  /** Customers with bottles out (or a bottle credit), with the detail per type. */
  public List<Map<String, Object>> open() {
    var rows =
        jdbc.queryForList(
            "SELECT c.id,c.name,c.phone,m.bottle_type AS type,sum(m.quantity) AS balance FROM"
                + " bottle_movements m JOIN customers c ON c.id=m.customer_id WHERE c.active=true"
                + " GROUP BY c.id,c.name,c.phone,m.bottle_type HAVING sum(m.quantity)<>0 ORDER BY"
                + " c.name,m.bottle_type");
    var byCustomer = new LinkedHashMap<Long, Map<String, Object>>();
    for (var row : rows) {
      var id = ((Number) row.get("id")).longValue();
      var entry =
          byCustomer.computeIfAbsent(
              id,
              k -> {
                var map = new LinkedHashMap<String, Object>();
                map.put("id", id);
                map.put("name", row.get("name"));
                map.put("phone", row.get("phone"));
                map.put("total", 0L);
                map.put("types", new ArrayList<Map<String, Object>>());
                return map;
              });
      entry.put("total", (Long) entry.get("total") + ((Number) row.get("balance")).longValue());
      @SuppressWarnings("unchecked")
      var types = (List<Map<String, Object>>) entry.get("types");
      types.add(Map.of("type", row.get("type"), "balance", row.get("balance")));
    }
    return new ArrayList<>(byCustomer.values());
  }
}
