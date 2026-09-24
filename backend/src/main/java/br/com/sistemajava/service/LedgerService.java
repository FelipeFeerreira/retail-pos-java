package br.com.sistemajava.service;

import br.com.sistemajava.security.CurrentUser;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Realized money movements per account (cash and bank). Entries are never edited, only reversed. */
@Service
public class LedgerService {
  public static final String SALE = "Venda à vista";
  public static final String CREDIT_RECEIPT = "Recebimento de fiado";
  public static final String CARD_SETTLEMENT = "Liquidação de cartão";
  public static final String DRAWER_DIFFERENCE = "Diferença de caixa";
  public static final String TRANSFER = "Transferência";
  public static final List<String> MANUAL_IN = List.of("Aporte do dono", "Outras receitas");
  public static final List<String> MANUAL_OUT = List.of("Retirada do dono", "Despesa avulsa");

  private final JdbcTemplate jdbc;
  private final CurrentUser current;

  public LedgerService(JdbcTemplate jdbc, CurrentUser current) {
    this.jdbc = jdbc;
    this.current = current;
  }

  public long account(String kind) {
    return jdbc.queryForObject(
        "SELECT id FROM financial_accounts WHERE kind=? AND active=true ORDER BY id LIMIT 1",
        Long.class,
        kind);
  }

  public void requireAccount(Long id) {
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM financial_accounts WHERE id=? AND active=true)",
            Boolean.class,
            id))) throw new BusinessException("Selecione uma conta financeira válida");
  }

  /** Posts an entry; zero amounts post nothing and return null. */
  @Transactional
  public Long post(
      long accountId,
      BigDecimal amount,
      LocalDate date,
      String category,
      String description,
      String source,
      Object reference) {
    if (amount == null || amount.signum() == 0) return null;
    return jdbc.queryForObject(
        "INSERT INTO ledger_entries(account_id,amount,entry_date,category,description,source,"
            + "reference,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,now()) RETURNING id",
        Long.class,
        accountId,
        Money.round(amount),
        Date.valueOf(date == null ? LotService.today() : date),
        category,
        description,
        source,
        reference == null ? "" : reference.toString(),
        current.get().id);
  }

  /** Posts the opposite entry; an entry can be reversed only once. */
  @Transactional
  public Long reverse(long entryId, String reason) {
    var rows =
        jdbc.queryForList(
            "SELECT account_id,amount,category,reversal_of FROM ledger_entries WHERE id=?",
            entryId);
    if (rows.isEmpty()) throw new BusinessException("Lançamento não encontrado");
    if (rows.get(0).get("reversal_of") != null)
      throw new BusinessException("Um estorno não pode ser estornado");
    try {
      return jdbc.queryForObject(
          "INSERT INTO ledger_entries(account_id,amount,entry_date,category,description,source,"
              + "reference,user_id,created_at,reversal_of) VALUES(?,?,?,?,?,'REVERSAL',?,?,now(),?)"
              + " RETURNING id",
          Long.class,
          rows.get(0).get("account_id"),
          ((BigDecimal) rows.get(0).get("amount")).negate(),
          Date.valueOf(LotService.today()),
          rows.get(0).get("category"),
          "Estorno: " + reason,
          String.valueOf(entryId),
          current.get().id,
          entryId);
    } catch (DuplicateKeyException ex) {
      throw new BusinessException("Lançamento já estornado");
    }
  }

  /** Reverses every still-standing entry posted by a source document. */
  @Transactional
  public void reverseSource(String source, Object reference, String reason) {
    for (var id :
        jdbc.queryForList(
            "SELECT e.id FROM ledger_entries e WHERE e.source=? AND e.reference=? AND NOT EXISTS"
                + " (SELECT 1 FROM ledger_entries r WHERE r.reversal_of=e.id)",
            Long.class,
            source,
            reference.toString())) reverse(id, reason);
  }

  public List<Map<String, Object>> accounts() {
    return jdbc.queryForList(
        "SELECT a.id,a.name,a.kind,a.opening_balance AS \"openingBalance\",a.checked,"
            + "a.opening_balance+coalesce((SELECT sum(amount) FROM ledger_entries e WHERE"
            + " e.account_id=a.id),0) AS balance FROM financial_accounts a WHERE a.active=true"
            + " ORDER BY a.id");
  }

  public List<Map<String, Object>> entries(LocalDate from, LocalDate to, Long accountId) {
    return jdbc.queryForList(
        "SELECT e.id,e.account_id AS \"accountId\",a.name AS account,e.amount,e.entry_date AS"
            + " date,e.category,e.description,e.source,e.reference,e.reconciled,e.reversal_of AS"
            + " \"reversalOf\",EXISTS(SELECT 1 FROM ledger_entries r WHERE r.reversal_of=e.id) AS"
            + " reversed,u.username FROM ledger_entries e JOIN financial_accounts a ON"
            + " a.id=e.account_id JOIN users u ON u.id=e.user_id WHERE e.entry_date BETWEEN ? AND ?"
            + " AND (?::bigint IS NULL OR e.account_id=?) ORDER BY e.entry_date DESC,e.id DESC LIMIT"
            + " 500",
        Date.valueOf(from),
        Date.valueOf(to),
        accountId,
        accountId);
  }
}
