package br.com.sistemajava.service;

import br.com.sistemajava.domain.Product;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Expiry lots of the stock. Callers must hold the product's row lock; every exit consumes the
 * lots that expire first (FEFO) and expired goods leave only as losses.
 */
@Service
public class LotService {
  private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
  private final JdbcTemplate jdbc;

  public record Lot(Long id, BigDecimal quantity, LocalDate expiresOn) {}

  public LotService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public static LocalDate today() {
    return LocalDate.now(ZONE);
  }

  List<Lot> open(Long productId) {
    return jdbc.query(
        "SELECT id,quantity,expires_on FROM stock_lots WHERE product_id=? AND quantity>0 ORDER BY"
            + " expires_on NULLS LAST,id FOR UPDATE",
        (row, i) ->
            new Lot(
                row.getLong("id"),
                row.getBigDecimal("quantity"),
                row.getObject("expires_on", LocalDate.class)),
        productId);
  }

  /** Validates and records which lots an exit uses; call before lowering product.quantity. */
  @Transactional
  public void consume(
      Product product,
      BigDecimal quantity,
      String source,
      Long reference,
      boolean allowExpired,
      Long lotId) {
    var lots = open(product.id);
    var today = today();
    if (lots.isEmpty()) {
      if (lotId != null) throw new BusinessException("Lote não encontrado ou sem saldo");
      if (!allowExpired && product.expiresOn != null && product.expiresOn.isBefore(today))
        throw new BusinessException("Produto vencido: " + product.name);
      return;
    }
    if (total(lots).compareTo(product.quantity) > 0)
      throw new BusinessException(
          "Lotes de " + product.name + " excedem o estoque. Faça a conferência antes de continuar.");
    var expired = total(lots.stream().filter(l -> expired(l, today)).toList());
    if (!allowExpired && quantity.compareTo(product.quantity.subtract(expired)) > 0)
      throw new BusinessException(
          product.name + ": o saldo disponível contém produtos vencidos. Registre a perda do lote.");
    var candidates = lots;
    if (lotId != null) {
      candidates = lots.stream().filter(l -> l.id().equals(lotId)).toList();
      if (candidates.isEmpty() || quantity.compareTo(candidates.get(0).quantity()) > 0)
        throw new BusinessException("Quantidade indisponível no lote selecionado");
    } else if (!allowExpired) candidates = lots.stream().filter(l -> !expired(l, today)).toList();
    var dated = total(candidates.stream().filter(l -> l.expiresOn() != null).toList());
    if (product.perishable && !allowExpired && dated.compareTo(quantity) < 0)
      throw new BusinessException(
          product.name + ": cadastre a validade do estoque perecível antes da saída.");
    var remaining = quantity;
    for (var lot : candidates) {
      if (remaining.signum() <= 0) break;
      var used = remaining.min(lot.quantity());
      jdbc.update("UPDATE stock_lots SET quantity=quantity-? WHERE id=?", used, lot.id());
      jdbc.update(
          "INSERT INTO lot_consumptions(lot_id,quantity,source,reference_id,created_at)"
              + " VALUES(?,?,?,?,now())",
          lot.id(),
          used,
          source,
          reference);
      remaining = remaining.subtract(used);
    }
  }

  /** Creates a lot for goods entering the stock; perishables require an expiry date. */
  @Transactional
  public void receive(Product product, BigDecimal quantity, LocalDate expiresOn, String note) {
    if (expiresOn == null) {
      if (product.perishable)
        throw new BusinessException("Informe a validade do recebimento perecível: " + product.name);
      return;
    }
    insert(product.id, quantity, expiresOn, note);
  }

  /** Details stock already on hand into a lot, without changing the product total. */
  @Transactional
  public Long register(Product product, BigDecimal quantity, LocalDate expiresOn, String note) {
    if (product.perishable && expiresOn == null)
      throw new BusinessException("Informe a validade do perecível");
    if (total(open(product.id)).add(quantity).compareTo(product.quantity) > 0)
      throw new BusinessException(
          "Os lotes não podem exceder o estoque total. Para mercadoria nova, use Entrada.");
    return insert(product.id, quantity, expiresOn, note);
  }

  @Transactional
  public void edit(
      Product product, Long lotId, BigDecimal quantity, LocalDate expiresOn, String note) {
    var others =
        total(open(product.id).stream().filter(l -> !l.id().equals(lotId)).toList());
    if (product.perishable && expiresOn == null)
      throw new BusinessException("Informe a validade do perecível");
    if (others.add(quantity).compareTo(product.quantity) > 0)
      throw new BusinessException("Lotes excedem o estoque do produto");
    jdbc.update(
        "UPDATE stock_lots SET quantity=?,expires_on=?,note=? WHERE id=?",
        quantity,
        expiresOn == null ? null : Date.valueOf(expiresOn),
        note == null ? "" : note.trim(),
        lotId);
  }

  /** Returns what an exit took back into the same lots (sale cancellation). */
  @Transactional
  public void restore(String source, Long reference) {
    jdbc.update(
        "UPDATE stock_lots l SET quantity=l.quantity+c.total FROM (SELECT lot_id,sum(quantity) AS"
            + " total FROM lot_consumptions WHERE source=? AND reference_id=? GROUP BY lot_id) c"
            + " WHERE c.lot_id=l.id",
        source,
        reference);
    jdbc.update(
        "DELETE FROM lot_consumptions WHERE source=? AND reference_id=?", source, reference);
  }

  /** Keeps products.expires_on as the earliest open lot once a product uses lots. */
  @Transactional
  public void sync(Product product) {
    var row =
        jdbc.queryForMap(
            "SELECT count(*) AS lots, min(expires_on) FILTER (WHERE quantity>0) AS first FROM"
                + " stock_lots WHERE product_id=?",
            product.id);
    if (((Number) row.get("lots")).longValue() > 0)
      product.expiresOn = row.get("first") == null ? null : ((Date) row.get("first")).toLocalDate();
  }

  public boolean tracked(Long productId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM stock_lots WHERE product_id=?)", Boolean.class, productId));
  }

  public Long productOf(Long lotId) {
    return jdbc.query(
            "SELECT product_id FROM stock_lots WHERE id=?", (row, i) -> row.getLong(1), lotId)
        .stream()
        .findFirst()
        .orElseThrow(jakarta.persistence.EntityNotFoundException::new);
  }

  public List<Map<String, Object>> list(Long productId, Integer days) {
    var sql =
        new StringBuilder(
            "SELECT l.id,l.product_id AS \"productId\",p.name AS \"productName\",p.unit,l.quantity,"
                + "l.expires_on AS \"expiresOn\",l.received_at AS \"receivedAt\",l.note,"
                + "(l.expires_on-CURRENT_DATE) AS \"daysLeft\" FROM stock_lots l JOIN products p ON"
                + " p.id=l.product_id WHERE l.quantity>0 AND p.active=true");
    var args = new ArrayList<Object>();
    if (productId != null) {
      sql.append(" AND l.product_id=?");
      args.add(productId);
    }
    if (days != null) {
      sql.append(" AND l.expires_on<=?");
      args.add(Date.valueOf(today().plusDays(days)));
    }
    sql.append(" ORDER BY l.expires_on NULLS LAST,p.name,l.id");
    return jdbc.queryForList(sql.toString(), args.toArray());
  }

  private Long insert(Long productId, BigDecimal quantity, LocalDate expiresOn, String note) {
    return jdbc.queryForObject(
        "INSERT INTO stock_lots(product_id,quantity,expires_on,received_at,note)"
            + " VALUES(?,?,?,now(),?) RETURNING id",
        Long.class,
        productId,
        quantity,
        expiresOn == null ? null : Date.valueOf(expiresOn),
        note == null ? "" : note.trim());
  }

  private static boolean expired(Lot lot, LocalDate today) {
    return lot.expiresOn() != null && lot.expiresOn().isBefore(today);
  }

  private static BigDecimal total(List<Lot> lots) {
    return lots.stream().map(Lot::quantity).reduce(BigDecimal.ZERO, BigDecimal::add);
  }
}
