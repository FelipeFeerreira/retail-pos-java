package br.com.sistemajava.service;

import java.math.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Sales patterns: weekday, hour, day type (holiday, pay day...), category, ABC and customers. */
@Service
@Transactional(readOnly = true)
public class AnalyticsService {
  private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
  private static final String[] WEEKDAYS = {
    "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"
  };
  private final JdbcTemplate jdbc;
  private final CalendarService calendar;

  public AnalyticsService(JdbcTemplate jdbc, CalendarService calendar) {
    this.jdbc = jdbc;
    this.calendar = calendar;
  }

  private record Bucket(String name, int[] count, BigDecimal[] total, Set<LocalDate> days) {
    Bucket(String name) {
      this(name, new int[1], new BigDecimal[] {BigDecimal.ZERO}, new TreeSet<>());
    }

    void add(LocalDate day, int sales, BigDecimal amount) {
      count[0] += sales;
      total[0] = total[0].add(amount);
      days.add(day);
    }

    Map<String, Object> view() {
      var map = new LinkedHashMap<String, Object>();
      map.put("name", name);
      map.put("sales", count[0]);
      map.put("total", Money.round(total[0]));
      map.put(
          "average",
          count[0] == 0
              ? BigDecimal.ZERO
              : total[0].divide(BigDecimal.valueOf(count[0]), 2, RoundingMode.HALF_UP));
      map.put("days", days.size());
      map.put(
          "perDay",
          days.isEmpty()
              ? BigDecimal.ZERO
              : total[0].divide(BigDecimal.valueOf(days.size()), 2, RoundingMode.HALF_UP));
      return map;
    }
  }

  public Map<String, Object> analytics(LocalDate from, LocalDate to) {
    if (to.isBefore(from) || from.plusYears(2).isBefore(to))
      throw new BusinessException("Selecione um período de até dois anos");
    var start = Timestamp.from(from.atStartOfDay(ZONE).toInstant());
    var end = Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant());
    var weekdays = new ArrayList<Bucket>();
    for (var name : WEEKDAYS) weekdays.add(new Bucket(name));
    var classes = new LinkedHashMap<String, Bucket>();
    for (var name : CalendarService.CLASSES) classes.put(name, new Bucket(name));
    for (var row :
        jdbc.queryForList(
            "SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,count(*) AS sales,"
                + "sum(total) AS total FROM sales WHERE status='COMPLETED' AND created_at>=? AND"
                + " created_at<? GROUP BY day",
            start,
            end)) {
      var day = ((java.sql.Date) row.get("day")).toLocalDate();
      var sales = ((Number) row.get("sales")).intValue();
      var total = (BigDecimal) row.get("total");
      weekdays.get(day.getDayOfWeek().getValue() - 1).add(day, sales, total);
      classes.get(calendar.classify(day)).add(day, sales, total);
    }
    var result = new LinkedHashMap<String, Object>();
    result.put("byWeekday", weekdays.stream().map(Bucket::view).toList());
    result.put("byDayType", classes.values().stream().map(Bucket::view).toList());
    var hours = new ArrayList<Map<String, Object>>();
    var byHour = new HashMap<Integer, Map<String, Object>>();
    for (var row :
        jdbc.queryForList(
            "SELECT extract(hour FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,"
                + "count(*) AS sales,sum(total) AS total FROM sales WHERE status='COMPLETED' AND"
                + " created_at>=? AND created_at<? GROUP BY hour",
            start,
            end)) byHour.put(((Number) row.get("hour")).intValue(), row);
    for (int h = 0; h < 24; h++) {
      var row = byHour.get(h);
      hours.add(
          Map.of(
              "hour", h,
              "sales", row == null ? 0 : ((Number) row.get("sales")).intValue(),
              "total", row == null ? BigDecimal.ZERO : row.get("total")));
    }
    result.put("byHour", hours);
    result.put(
        "byCategory",
        jdbc.queryForList(
            "SELECT coalesce(c.name,'Sem categoria') AS category,sum(i.quantity) AS quantity,"
                + "sum(i.total) AS total,sum(i.total-i.cost*i.quantity) AS margin,count(DISTINCT"
                + " i.sale_id) AS sales FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN"
                + " products p ON p.id=i.product_id LEFT JOIN categories c ON c.id=p.category_id"
                + " WHERE s.status='COMPLETED' AND s.created_at>=? AND s.created_at<? GROUP BY"
                + " c.name ORDER BY total DESC",
            start,
            end));
    result.put(
        "topCustomers",
        jdbc.queryForList(
            "SELECT c.id,c.name,count(*) AS purchases,sum(s.total) AS total,max(s.created_at) AS"
                + " \"lastPurchase\" FROM sales s JOIN customers c ON c.id=s.customer_id WHERE"
                + " s.status='COMPLETED' AND s.created_at>=? AND s.created_at<? GROUP BY c.id,c.name"
                + " ORDER BY total DESC LIMIT 10",
            start,
            end));
    result.put("abc", abc(start, end));
    result.put("upcoming", calendar.upcoming(LotService.today(), 45));
    return result;
  }

  /** A ≈ 80% of revenue, B up to 95%, C the rest. */
  private List<Map<String, Object>> abc(Timestamp start, Timestamp end) {
    var rows =
        jdbc.queryForList(
            "SELECT i.product_id AS id,i.product_name AS name,sum(i.quantity) AS quantity,"
                + "sum(i.total) AS total FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE"
                + " s.status='COMPLETED' AND s.created_at>=? AND s.created_at<? GROUP BY"
                + " i.product_id,i.product_name ORDER BY total DESC",
            start,
            end);
    var grand =
        rows.stream()
            .map(r -> (BigDecimal) r.get("total"))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    var cumulative = BigDecimal.ZERO;
    var result = new ArrayList<Map<String, Object>>();
    for (var row : rows) {
      var before =
          grand.signum() == 0
              ? BigDecimal.ZERO
              : cumulative.multiply(BigDecimal.valueOf(100)).divide(grand, 2, RoundingMode.HALF_UP);
      cumulative = cumulative.add((BigDecimal) row.get("total"));
      var copy = new LinkedHashMap<>(row);
      copy.put(
          "share",
          grand.signum() == 0
              ? BigDecimal.ZERO
              : ((BigDecimal) row.get("total"))
                  .multiply(BigDecimal.valueOf(100))
                  .divide(grand, 2, RoundingMode.HALF_UP));
      // Classified by where the product starts in the cumulative curve.
      copy.put(
          "class",
          before.compareTo(BigDecimal.valueOf(80)) < 0
              ? "A"
              : before.compareTo(BigDecimal.valueOf(95)) < 0 ? "B" : "C");
      result.add(copy);
    }
    return result;
  }
}
