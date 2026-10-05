package br.com.sistemajava.config;

import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds a clean database with fictional demo data for the online beta. Enabled with the {@code demo}
 * Spring profile or {@code DEMO_SEED=true}. Safe to run multiple times: it only inserts when tables
 * are empty.
 */
@Component
@Profile("demo")
public class DemoSeeder implements ApplicationRunner {
  private final CategoryRepository categories;
  private final ProductRepository products;
  private final CustomerRepository customers;
  private final SettingRepository settings;

  public DemoSeeder(
      CategoryRepository categories,
      ProductRepository products,
      CustomerRepository customers,
      SettingRepository settings) {
    this.categories = categories;
    this.products = products;
    this.customers = customers;
    this.settings = settings;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    if (categories.count() > 0 || products.count() > 0) return;

    var catMap = seedCategories();
    seedProducts(catMap);
    seedCustomers();
    seedSettings();
  }

  private Map<String, Category> seedCategories() {
    var data =
        List.of(
            new String[]{"Beverages", "30.00"},
            new String[]{"Bakery", "25.00"},
            new String[]{"Dairy", "20.00"},
            new String[]{"Produce", "35.00"},
            new String[]{"Snacks", "28.00"},
            new String[]{"Cleaning", "22.00"});
    var map = new HashMap<String, Category>();
    for (var row : data) {
      var c = new Category();
      c.name = row[0];
      c.markup = new BigDecimal(row[1]);
      map.put(c.name, categories.save(c));
    }
    return map;
  }

  private void seedProducts(Map<String, Category> cats) {
    var rows =
        List.of(
            new Object[]{"BEV-001", "7890000000010", "Sparkling Water 500ml", "Beverages", "UN", 3.99, 1.80, 120},
            new Object[]{"BEV-002", "7890000000027", "Cola Soda 2L", "Beverages", "UN", 8.49, 4.50, 80},
            new Object[]{"BEV-003", "7890000000034", "Orange Juice 1L", "Beverages", "UN", 12.90, 6.80, 45},
            new Object[]{"BAK-001", "7890000000041", "Artisan Bread", "Bakery", "UN", 9.90, 3.50, 60},
            new Object[]{"BAK-002", "7890000000058", "Croissant", "Bakery", "UN", 6.50, 2.40, 50},
            new Object[]{"DAI-001", "7890000000065", "Whole Milk 1L", "Dairy", "UN", 7.49, 4.20, 90},
            new Object[]{"DAI-002", "7890000000072", "Mozzarella Cheese 500g", "Dairy", "UN", 34.90, 18.00, 35},
            new Object[]{"PRO-001", null, "Banana", "Produce", "KG", 6.99, 3.20, 40},
            new Object[]{"PRO-002", null, "Apple", "Produce", "KG", 9.90, 4.50, 35},
            new Object[]{"PRO-003", null, "Tomato", "Produce", "KG", 7.49, 3.00, 28},
            new Object[]{"SNK-001", "7890000000089", "Chocolate Bar", "Snacks", "UN", 5.99, 2.80, 100},
            new Object[]{"SNK-002", "7890000000096", "Potato Chips", "Snacks", "UN", 11.90, 5.50, 75},
            new Object[]{"CLN-001", "7890000000102", "Laundry Detergent", "Cleaning", "UN", 24.90, 12.50, 40},
            new Object[]{"CLN-002", "7890000000119", "Multi-purpose Cleaner", "Cleaning", "UN", 14.90, 7.20, 55});
    int i = 1;
    for (var row : rows) {
      var p = new Product();
      p.code = (String) row[0];
      p.barcode = (String) row[1];
      p.name = (String) row[2];
      p.category = cats.get(row[3]);
      p.unit = (String) row[4];
      p.price = BigDecimal.valueOf((Double) row[5]);
      p.cost = BigDecimal.valueOf((Double) row[6]);
      p.quantity = BigDecimal.valueOf((Integer) row[7]);
      p.minimumStock = BigDecimal.valueOf(10);
      p.active = true;
      products.save(p);
      i++;
    }
  }

  private void seedCustomers() {
    var rows =
        List.of(
            new Object[]{"Alice Johnson", "555-0101", 200.00},
            new Object[]{"Bob Smith", "555-0102", 300.00},
            new Object[]{"Carol White", "555-0103", 150.00});
    for (var row : rows) {
      var c = new Customer();
      c.name = (String) row[0];
      c.phone = (String) row[1];
      c.creditLimit = BigDecimal.valueOf((Double) row[2]);
      c.balance = BigDecimal.ZERO;
      c.active = true;
      customers.save(c);
    }
  }

  private void seedSettings() {
    var defaults =
        Map.of(
            "store.name", "Empório Market",
            "store.address", "Demo Street, 123",
            "store.footer", "Thank you for shopping with us!",
            "theme", "light",
            "language", "en",
            "calendar.payDays", "5,15,20,30",
            "bottle.types", "600ml,1L,2L,Other");
    for (var e : defaults.entrySet()) {
      if (settings.findById(e.getKey()).isEmpty()) {
        var s = new Setting();
        s.id = e.getKey();
        s.value = e.getValue();
        settings.save(s);
      }
    }
  }
}
