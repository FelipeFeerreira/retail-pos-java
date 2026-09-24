package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.Product;
import br.com.sistemajava.repo.ProductRepository;
import br.com.sistemajava.security.CurrentUser;
import jakarta.persistence.EntityNotFoundException;
import java.math.*;
import java.sql.Date;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Suppliers and goods received from them: stock, weighted average cost, lots and new prices. */
@Service
public class PurchaseService {
  private final JdbcTemplate jdbc;
  private final ProductRepository products;
  private final CatalogService catalog;
  private final LotService lots;
  private final CurrentUser current;
  private final AuditService audit;
  private final Updates updates;
  private final ObjectProvider<PurchaseListener> listeners;

  /** Lets the financial module create the payable of a received purchase atomically. */
  public interface PurchaseListener {
    void received(long purchaseId, Dtos.PurchaseInput input, BigDecimal total, String supplier);
  }

  public PurchaseService(
      JdbcTemplate jdbc,
      ProductRepository products,
      CatalogService catalog,
      LotService lots,
      CurrentUser current,
      AuditService audit,
      Updates updates,
      ObjectProvider<PurchaseListener> listeners) {
    this.jdbc = jdbc;
    this.products = products;
    this.catalog = catalog;
    this.lots = lots;
    this.current = current;
    this.audit = audit;
    this.updates = updates;
    this.listeners = listeners;
  }

  public List<Map<String, Object>> suppliers(String q) {
    return jdbc.queryForList(
        "SELECT id,name,document,phone FROM suppliers WHERE active=true AND lower(name) LIKE"
            + " lower(?) ORDER BY name LIMIT 100",
        "%" + (q == null ? "" : q.trim()) + "%");
  }

  @Transactional
  public Map<String, Object> saveSupplier(Long id, Dtos.SupplierInput input) {
    var name = input.name().trim();
    var document = CatalogService.blank(input.document());
    var phone = CatalogService.blank(input.phone());
    try {
      if (id == null)
        id =
            jdbc.queryForObject(
                "INSERT INTO suppliers(name,document,phone) VALUES(?,?,?) RETURNING id",
                Long.class,
                name,
                document,
                phone);
      else if (jdbc.update(
              "UPDATE suppliers SET name=?,document=?,phone=? WHERE id=?",
              name,
              document,
              phone,
              id)
          == 0) throw new EntityNotFoundException();
    } catch (DuplicateKeyException ex) {
      throw new BusinessException("Já existe um fornecedor com esse nome");
    }
    audit.record("SAVE", "suppliers", id, name);
    return jdbc.queryForMap("SELECT id,name,document,phone FROM suppliers WHERE id=?", id);
  }

  @Transactional
  public Map<String, Object> receive(Dtos.PurchaseInput input) {
    var user = current.get();
    // Serializes retries of the same request, like checkout.
    jdbc.queryForObject(
        "SELECT pg_advisory_xact_lock(?)",
        Object.class,
        input.requestId().getMostSignificantBits() ^ input.requestId().getLeastSignificantBits());
    var previous =
        jdbc.query(
            "SELECT id FROM purchases WHERE request_id=?",
            (row, i) -> row.getLong(1),
            input.requestId());
    if (!previous.isEmpty()) return detail(previous.get(0));
    var supplier =
        jdbc.query(
                "SELECT name FROM suppliers WHERE id=? AND active=true",
                (row, i) -> row.getString(1),
                input.supplierId())
            .stream()
            .findFirst()
            .orElseThrow(() -> new BusinessException("Fornecedor não encontrado"));
    var document = input.document().trim();
    if (Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM purchases WHERE supplier_id=? AND"
                + " lower(document)=lower(?))",
            Boolean.class,
            input.supplierId(),
            document)))
      throw new BusinessException("Compra já recebida para este fornecedor e documento");
    if (input.items().stream().map(Dtos.PurchaseItemInput::productId).distinct().count()
        != input.items().size()) throw new BusinessException("Agrupe produtos repetidos");
    var today = LotService.today();
    var total = BigDecimal.ZERO;
    for (var item : input.items()) {
      if (item.expiresOn() != null && item.expiresOn().isBefore(today))
        throw new BusinessException("Não receba mercadoria vencida para venda");
      total = total.add(Money.round(item.quantity().multiply(item.unitCost())));
    }
    if (total.signum() <= 0)
      throw new BusinessException("A compra precisa ter valor maior que zero");
    var id =
        jdbc.queryForObject(
            "INSERT INTO purchases(request_id,supplier_id,document,due_date,payment,total,"
                + "created_at,user_id) VALUES(?,?,?,?,?,?,now(),?) RETURNING id",
            Long.class,
            input.requestId(),
            input.supplierId(),
            document,
            Date.valueOf(input.dueDate()),
            input.payment(),
            total,
            user.id);
    var label = "Compra #" + id + " / " + document;
    for (var item :
        input.items().stream()
            .sorted(Comparator.comparing(Dtos.PurchaseItemInput::productId))
            .toList()) {
      Product product =
          products.lock(item.productId()).orElseThrow(EntityNotFoundException::new);
      if (!product.active) throw new BusinessException("Produto inativo: " + product.name);
      Money.quantity(product.unit, item.quantity());
      lots.receive(product, item.quantity(), item.expiresOn(), label);
      product.cost =
          product
              .cost
              .multiply(product.quantity)
              .add(item.unitCost().multiply(item.quantity()))
              .divide(product.quantity.add(item.quantity()), 2, RoundingMode.HALF_UP);
      product.quantity = product.quantity.add(item.quantity());
      lots.sync(product);
      if (item.newPrice() != null) catalog.changePrice(product, item.newPrice());
      catalog.movement(product, null, "PURCHASE", item.quantity(), label);
      jdbc.update(
          "INSERT INTO purchase_items(purchase_id,product_id,product_name,unit,quantity,unit_cost,"
              + "total,expires_on,new_price) VALUES(?,?,?,?,?,?,?,?,?)",
          id,
          product.id,
          product.name,
          product.unit,
          item.quantity(),
          item.unitCost(),
          Money.round(item.quantity().multiply(item.unitCost())),
          item.expiresOn() == null ? null : Date.valueOf(item.expiresOn()),
          item.newPrice());
    }
    var amount = total;
    listeners.orderedStream().forEach(l -> l.received(id, input, amount, supplier));
    audit.record("PURCHASE", "purchases", id, supplier + " " + document + " " + total);
    updates.publish("stock");
    return detail(id);
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> list(int page) {
    return jdbc.queryForList(
        "SELECT p.id,p.document,s.name AS supplier,p.due_date AS \"dueDate\",p.payment,p.total,"
            + "p.created_at AS \"createdAt\",u.username,(SELECT count(*) FROM purchase_items i WHERE"
            + " i.purchase_id=p.id) AS items FROM purchases p JOIN suppliers s ON"
            + " s.id=p.supplier_id JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50"
            + " OFFSET ?",
        Math.max(0, page) * 50);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> detail(Long id) {
    var rows =
        jdbc.queryForList(
            "SELECT p.id,p.document,s.name AS supplier,p.due_date AS \"dueDate\",p.payment,p.total,"
                + "p.created_at AS \"createdAt\",u.username FROM purchases p JOIN suppliers s ON"
                + " s.id=p.supplier_id JOIN users u ON u.id=p.user_id WHERE p.id=?",
            id);
    if (rows.isEmpty()) throw new EntityNotFoundException();
    var result = new LinkedHashMap<>(rows.get(0));
    result.put(
        "items",
        jdbc.queryForList(
            "SELECT id,product_id AS \"productId\",product_name AS \"productName\",unit,quantity,"
                + "unit_cost AS \"unitCost\",total,expires_on AS \"expiresOn\",new_price AS"
                + " \"newPrice\" FROM purchase_items WHERE purchase_id=? ORDER BY id",
            id));
    return result;
  }
}
