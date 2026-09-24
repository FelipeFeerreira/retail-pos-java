package br.com.sistemajava.api;

import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.security.CurrentUser;
import br.com.sistemajava.service.*;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class SettingsController {
  private final SettingRepository settings;
  private final PrinterRepository printers;
  private final ScaleRepository scales;
  private final UserRepository users;
  private final AuditLogRepository logs;
  private final AuditService audit;
  private final CurrentUser current;
  private final PasswordEncoder passwords;

  public SettingsController(
      SettingRepository settings,
      PrinterRepository printers,
      ScaleRepository scales,
      UserRepository users,
      AuditLogRepository logs,
      AuditService audit,
      CurrentUser current,
      PasswordEncoder passwords) {
    this.settings = settings;
    this.printers = printers;
    this.scales = scales;
    this.users = users;
    this.logs = logs;
    this.audit = audit;
    this.current = current;
    this.passwords = passwords;
  }

  @GetMapping("/settings")
  public Map<String, String> settings() {
    var result = new LinkedHashMap<String, String>();
    var prefix = "user." + current.get().id + ".";
    for (var setting : settings.findAll()) {
      if (!setting.id.startsWith("user.")) result.put(setting.id, setting.value);
      else if (setting.id.startsWith(prefix))
        result.put(setting.id.substring(prefix.length()), setting.value);
    }
    return result;
  }

  @PutMapping("/settings")
  @Transactional
  public Map<String, String> save(@RequestBody Map<String, String> input) {
    if (input.size() > 60) throw new BusinessException("Muitas configurações");
    for (var entry : input.entrySet()) {
      var key = entry.getKey();
      var value = entry.getValue();
      if (value == null || value.length() > 500) throw new BusinessException("Valor inválido");
      if (key.equals("theme") || key.equals("language")) {
        if (key.equals("theme") && !Set.of("light", "dark").contains(value))
          throw new BusinessException("Tema inválido");
        if (key.equals("language") && !Set.of("pt", "en").contains(value))
          throw new BusinessException("Idioma inválido");
        key = "user." + current.get().id + "." + key;
      } else {
        if (!current.manager())
          throw new org.springframework.security.access.AccessDeniedException("Manager required");
        if (key.startsWith("fee.")
            && Set.of("CREDIT", "DEBIT", "PIX", "VOUCHER", "CASH", "ACCOUNT")
                .contains(key.substring(4))) {
          var rate = new BigDecimal(value);
          if (rate.signum() < 0 || rate.compareTo(new BigDecimal("100")) > 0)
            throw new BusinessException("Taxa deve estar entre 0 e 100");
        } else if (key.equals("credit.termDays") || key.startsWith("card.days")) {
          var days = Integer.parseInt(value);
          if (days < 0 || days > 365) throw new BusinessException("Prazo deve estar entre 0 e 365 dias");
          if (key.startsWith("card.days") && !Set.of("CREDIT", "DEBIT", "VOUCHER").contains(key.substring(9)))
            throw new BusinessException("Configuração desconhecida");
        } else if (key.equals("credit.interestDay") || key.equals("credit.penaltyDay")) {
          var rate = new BigDecimal(value);
          if (rate.signum() < 0 || rate.compareTo(BigDecimal.TEN) > 0)
            throw new BusinessException("Encargo diário deve estar entre 0 e 10%");
        } else if (key.equals("calendar.payDays")) {
          if (!value.matches("\\s*(\\d{1,2}\\s*(,\\s*\\d{1,2}\\s*)*)?")
              || Arrays.stream(value.split(","))
                  .filter(d -> !d.isBlank())
                  .map(d -> Integer.parseInt(d.trim()))
                  .anyMatch(d -> d < 1 || d > 31))
            throw new BusinessException("Informe dias entre 1 e 31 separados por vírgula");
        } else if (key.equals("calendar.localHolidays")) {
          for (var day : value.split(",")) {
            var text = day.trim();
            if (text.isEmpty()) continue;
            try {
              if (text.startsWith("--")) java.time.MonthDay.parse(text);
              else java.time.LocalDate.parse(text);
            } catch (java.time.format.DateTimeParseException ex) {
              throw new BusinessException("Feriado inválido: " + text + " (use --MM-DD ou AAAA-MM-DD)");
            }
          }
        } else if (key.equals("bottle.types")) {
          if (value.isBlank()) throw new BusinessException("Informe ao menos um tipo de casco");
        } else if (key.equals("pricing.markup")) {
          var markup = new BigDecimal(value);
          if (markup.signum() < 0 || markup.compareTo(new BigDecimal("1000")) > 0)
            throw new BusinessException("Margem deve estar entre 0 e 1000%");
        } else if (key.equals("pricing.rounding")) {
          if (!Set.of("ends9", "0.05", "0.10", "0.01").contains(value))
            throw new BusinessException("Arredondamento inválido");
        } else if (key.equals("receipt.autoPrint")) {
          if (!Set.of("true", "false").contains(value))
            throw new BusinessException("Impressão automática inválida");
        } else if (key.equals("receipt.copies")) {
          if (!Set.of("1", "2", "3").contains(value))
            throw new BusinessException("Informe de 1 a 3 vias");
        } else if (!Set.of(
                "store.name", "store.address", "store.cnpj", "store.phone", "store.footer")
            .contains(key))
          throw new BusinessException("Configuração desconhecida");
      }
      settings.save(new Setting(key, value));
      audit.record("UPDATE", "settings", key, value);
    }
    return settings();
  }

  @GetMapping("/printers")
  public List<Printer> printers() {
    return printers.findAll();
  }

  @PostMapping("/printers")
  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public Printer printer(@Valid @RequestBody Dtos.HardwareInput input) {
    if (!Set.of("BROWSER", "CUPS", "USB").contains(input.type()))
      throw new BusinessException("Tipo inválido");
    var p = new Printer();
    p.name = input.name();
    p.connection = input.type();
    p.address = input.address();
    printers.save(p);
    audit.record("CREATE", "printers", p.id, p.name);
    return p;
  }

  @DeleteMapping("/printers/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public void deletePrinter(@PathVariable Long id) {
    printers.deleteById(id);
    audit.record("DELETE", "printers", id, "");
  }

  @GetMapping("/scales")
  public List<Scale> scales() {
    return scales.findAll();
  }

  @PostMapping("/scales")
  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public Scale scale(@Valid @RequestBody Dtos.HardwareInput input) {
    var s = new Scale();
    s.name = input.name();
    s.protocol = input.type();
    s.port = input.address();
    scales.save(s);
    audit.record("CREATE", "scales", s.id, s.name);
    return s;
  }

  @DeleteMapping("/scales/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public void deleteScale(@PathVariable Long id) {
    scales.deleteById(id);
    audit.record("DELETE", "scales", id, "");
  }

  @GetMapping("/users")
  @PreAuthorize("hasRole('ADMIN')")
  public List<User> users() {
    return users.findAll();
  }

  @PostMapping("/users")
  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public User user(@Valid @RequestBody Dtos.UserInput input) {
    var u = new User();
    u.username = input.username();
    u.password = passwords.encode(input.password());
    u.role = input.role();
    users.saveAndFlush(u);
    audit.record("CREATE", "users", u.id, u.username);
    return u;
  }

  @GetMapping("/audit-log")
  @PreAuthorize("hasRole('ADMIN')")
  public Page<AuditLog> logs(@RequestParam(defaultValue = "0") int page) {
    return logs.findAll(
        PageRequest.of(Math.max(0, page), 100, Sort.by(Sort.Direction.DESC, "createdAt")));
  }
}
