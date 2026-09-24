package br.com.sistemajava.service;

import br.com.sistemajava.repo.SettingRepository;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Holidays, eves and pay days: the days that change how a neighbourhood store sells. */
@Service
public class CalendarService {
  public static final String HOLIDAY = "Feriado";
  public static final String EVE = "Véspera de feriado";
  public static final String PAYDAY = "Dia de pagamento";
  public static final String WEEKEND = "Fim de semana";
  public static final String NORMAL = "Dia normal";
  public static final List<String> CLASSES = List.of(HOLIDAY, EVE, PAYDAY, WEEKEND, NORMAL);

  private final SettingRepository settings;

  public CalendarService(SettingRepository settings) {
    this.settings = settings;
  }

  /** Easter Sunday (Meeus/Jones/Butcher). */
  public static LocalDate easter(int year) {
    int a = year % 19, b = year / 100, c = year % 100, d = b / 4, e = b % 4;
    int f = (b + 8) / 25, g = (b - f + 1) / 3, h = (19 * a + b - d - g + 15) % 30;
    int i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = (a + 11 * h + 22 * l) / 451;
    int month = (h + l - 7 * m + 114) / 31, day = ((h + l - 7 * m + 114) % 31) + 1;
    return LocalDate.of(year, month, day);
  }

  /** National holidays plus Carnival and Corpus Christi, which local commerce feels as holidays. */
  public Map<LocalDate, String> holidays(int year) {
    var easter = easter(year);
    var map = new TreeMap<LocalDate, String>();
    map.put(LocalDate.of(year, 1, 1), "Confraternização Universal");
    map.put(easter.minusDays(48), "Carnaval (segunda)");
    map.put(easter.minusDays(47), "Carnaval (terça)");
    map.put(easter.minusDays(2), "Sexta-feira Santa");
    map.put(easter, "Páscoa");
    map.put(LocalDate.of(year, 4, 21), "Tiradentes");
    map.put(LocalDate.of(year, 5, 1), "Dia do Trabalho");
    map.put(easter.plusDays(60), "Corpus Christi");
    map.put(LocalDate.of(year, 9, 7), "Independência do Brasil");
    map.put(LocalDate.of(year, 10, 12), "Nossa Senhora Aparecida");
    map.put(LocalDate.of(year, 11, 2), "Finados");
    map.put(LocalDate.of(year, 11, 15), "Proclamação da República");
    if (year >= 2024) map.put(LocalDate.of(year, 11, 20), "Consciência Negra");
    map.put(LocalDate.of(year, 12, 25), "Natal");
    // Local holidays: "--MM-DD" every year or "YYYY-MM-DD" once.
    for (var raw : setting("calendar.localHolidays", "").split(",")) {
      var text = raw.trim();
      try {
        if (text.startsWith("--"))
          map.put(MonthDay.parse(text).atYear(year), "Feriado municipal");
        else if (!text.isEmpty() && LocalDate.parse(text).getYear() == year)
          map.put(LocalDate.parse(text), "Feriado municipal");
      } catch (RuntimeException ignored) {
        // Invalid entries are rejected when saved; old ones are skipped.
      }
    }
    return map;
  }

  private String setting(String key, String fallback) {
    return settings.findById(key).map(s -> s.value).orElse(fallback);
  }

  public String holidayName(LocalDate day) {
    return holidays(day.getYear()).get(day);
  }

  List<Integer> payDays() {
    var days = new TreeSet<Integer>();
    for (var raw : setting("calendar.payDays", "5,15,20,30").split(","))
      try {
        var day = Integer.parseInt(raw.trim());
        if (day >= 1 && day <= 31) days.add(day);
      } catch (NumberFormatException ignored) {
        // Validated on save.
      }
    return new ArrayList<>(days);
  }

  /** 5th business day of the month, the classic salary day. */
  public LocalDate fifthBusinessDay(int year, int month) {
    var holidays = holidays(year);
    var day = LocalDate.of(year, month, 1);
    int count = 0;
    while (true) {
      if (day.getDayOfWeek().getValue() <= 5 && !holidays.containsKey(day) && ++count == 5)
        return day;
      day = day.plusDays(1);
    }
  }

  public boolean payday(LocalDate day) {
    var configured = payDays();
    if (configured.contains(day.getDayOfMonth())) return true;
    if (day.equals(fifthBusinessDay(day.getYear(), day.getMonthValue()))) return true;
    // A configured day 30 or 31 falls on the last day of shorter months.
    var last = day.withDayOfMonth(day.lengthOfMonth());
    return day.equals(last) && configured.stream().anyMatch(d -> d > last.getDayOfMonth());
  }

  /** Holiday beats eve, which beats pay day, which beats weekend. */
  public String classify(LocalDate day) {
    if (holidayName(day) != null) return HOLIDAY;
    if (holidayName(day.plusDays(1)) != null) return EVE;
    if (payday(day)) return PAYDAY;
    if (day.getDayOfWeek().getValue() >= 6) return WEEKEND;
    return NORMAL;
  }

  /** Upcoming holidays and pay days, to plan the week's purchases. */
  public List<Map<String, Object>> upcoming(LocalDate from, int days) {
    var list = new ArrayList<Map<String, Object>>();
    for (int i = 0; i <= days; i++) {
      var day = from.plusDays(i);
      var name = holidayName(day);
      if (name != null) list.add(Map.of("date", day, "type", HOLIDAY, "name", name));
      else if (payday(day))
        list.add(
            Map.of(
                "date",
                day,
                "type",
                PAYDAY,
                "name",
                day.equals(fifthBusinessDay(day.getYear(), day.getMonthValue()))
                    ? "5º dia útil (pagamento)"
                    : "Dia de pagamento"));
    }
    return list;
  }
}
