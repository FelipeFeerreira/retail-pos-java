package br.com.sistemajava.service;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ReportService {
  private final JdbcTemplate jdbc;
  private final ZoneId zone = ZoneId.of("America/Sao_Paulo");

  public ReportService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Map<String, Object> report(LocalDate from, LocalDate to) {
    if (to.isBefore(from) || from.plusYears(2).isBefore(to))
      throw new BusinessException("Selecione um período de até dois anos");
    var start = java.sql.Timestamp.from(from.atStartOfDay(zone).toInstant());
    var end = java.sql.Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant());
    var result = new LinkedHashMap<String, Object>();
    result.put(
        "summary",
        jdbc.queryForMap(
            "SELECT count(*) AS sales, coalesce(sum(total),0) AS revenue, coalesce(sum(fees),0) AS"
                + " fees, coalesce(avg(total),0) AS average FROM sales WHERE status='COMPLETED' AND"
                + " created_at>=? AND created_at<?",
            start,
            end));
    // Costs that never show up as sales but still reduce profit.
    result.put(
        "writeoffs",
        jdbc.queryForList(
            "SELECT kind, coalesce(sum(total_cost),0) AS total FROM writeoffs WHERE created_at>=? AND"
                + " created_at<? GROUP BY kind",
            start,
            end));
    result.put(
        "daily",
        jdbc.queryForList(
            "SELECT to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,"
                + " sum(total) AS total, count(*) AS count FROM sales WHERE status='COMPLETED' AND"
                + " created_at>=? AND created_at<? GROUP BY day ORDER BY day",
            start,
            end));
    result.put(
        "bestSellers",
        jdbc.queryForList(
            "SELECT i.product_id AS id, i.product_name AS name, sum(i.quantity) AS quantity,"
                + " sum(i.total) AS total, sum(i.total-i.cost*i.quantity) AS gross_margin FROM"
                + " sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.status='COMPLETED' AND"
                + " s.created_at>=? AND s.created_at<? GROUP BY i.product_id,i.product_name ORDER"
                + " BY total DESC LIMIT 20",
            start,
            end));
    result.put(
        "payments",
        jdbc.queryForList(
            "SELECT p.method, sum(p.amount) AS total, sum(p.fee) AS fees FROM payments p JOIN sales"
                + " s ON s.id=p.sale_id WHERE s.status='COMPLETED' AND s.created_at>=? AND"
                + " s.created_at<? GROUP BY p.method",
            start,
            end));
    result.put(
        "stock",
        jdbc.queryForList(
            """
SELECT p.id,p.name,p.unit,p.quantity,p.minimum_stock,p.expires_on,
 coalesce(s.sold,0) AS sold,
 CASE WHEN (p.quantity-coalesce(m.delta,0)+p.quantity-coalesce(n.delta,0))/2 > 0
   THEN round(coalesce(s.sold,0)/((p.quantity-coalesce(m.delta,0)+p.quantity-coalesce(n.delta,0))/2),3) ELSE 0 END AS turnover
FROM products p
LEFT JOIN (SELECT i.product_id,sum(i.quantity) AS sold FROM sale_items i JOIN sales s ON s.id=i.sale_id
 WHERE s.status='COMPLETED' AND s.created_at>=? AND s.created_at<? GROUP BY i.product_id) s ON s.product_id=p.id
LEFT JOIN (SELECT product_id,sum(quantity) AS delta FROM stock_movements WHERE created_at>=? GROUP BY product_id) m ON m.product_id=p.id
LEFT JOIN (SELECT product_id,sum(quantity) AS delta FROM stock_movements WHERE created_at>=? GROUP BY product_id) n ON n.product_id=p.id
WHERE p.active=true ORDER BY p.name
""",
            start,
            end,
            start,
            end));
    result.put(
        "overdue",
        jdbc.queryForList(
            "SELECT c.id,c.name,sum(d.remaining) AS balance,min(d.due_date) AS due_date FROM"
                + " customers c JOIN credits d ON d.customer_id=c.id WHERE d.remaining>0 AND"
                + " d.due_date<CURRENT_DATE GROUP BY c.id,c.name ORDER BY due_date"));
    return result;
  }
}
