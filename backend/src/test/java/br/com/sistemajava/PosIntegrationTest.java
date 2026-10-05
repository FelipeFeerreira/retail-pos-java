package br.com.sistemajava;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.domain.*;
import br.com.sistemajava.repo.*;
import br.com.sistemajava.service.*;
import com.fasterxml.jackson.databind.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;

@Testcontainers
@SpringBootTest(
    properties = {
      "app.jwt-secret=test-secret-at-least-thirty-two-characters-long",
      "app.admin-password=integration-password",
      "app.backup-cron=-"
    })
@AutoConfigureMockMvc
@WithMockUser(username = "admin", roles = "ADMIN")
class PosIntegrationTest {
  @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  @Autowired SaleService sales;
  @Autowired ProductRepository products;
  @Autowired CustomerRepository customers;
  @Autowired PasswordEncoder passwords;
  long productId, customerId;

  @BeforeEach
  void reset() {
    jdbc.execute(
        "TRUNCATE TABLE"
            + " bottle_movements,bank_statement_lines,card_receivables,payable_payments,payables,ledger_entries,"
            + "production_inputs,productions,recipe_items,recipes,purchase_items,purchases,suppliers,"
            + "lot_consumptions,stock_lots,writeoff_items,writeoffs,inventory_counts,price_history,"
            + "cash_movements,cash_sessions,payments,sale_items,stock_movements,credits,price_rules,sales,products,customers,categories,audit_log,printers,scales"
            + " RESTART IDENTITY CASCADE");
    jdbc.update("INSERT INTO categories(name) VALUES ('Teste')");
    jdbc.update(
        "INSERT INTO products(code,name,unit,price,cost,quantity,minimum_stock,category_id) VALUES"
            + " ('A','Arroz','UN',10,5,10,2,1),('B','Banana','KG',6.99,3,10,1,1)");
    jdbc.update("INSERT INTO customers(name,credit_limit) VALUES ('Maria',100)");
    jdbc.update("DELETE FROM users WHERE username<>'admin'");
    jdbc.update(
        "INSERT INTO cash_sessions(user_id,opened_at,opening_amount) SELECT id,NOW(),0 FROM users"
            + " WHERE username='admin'");
    productId = jdbc.queryForObject("select id from products where code='A'", Long.class);
    customerId = jdbc.queryForObject("select id from customers where name='Maria'", Long.class);
  }

  String productBody(String code) {
    return "{\"code\":\""
        + code
        + "\",\"name\":\"Produto\",\"unit\":\"UN\",\"categoryId\":1,\"price\":4.50,\"cost\":2,\"minimumStock\":1}";
  }

  Dtos.SaleInput sale(long id, String quantity, String amount, String method, UUID request) {
    return new Dtos.SaleInput(
        request,
        method.equals("ACCOUNT") ? customerId : null,
        "RETAIL",
        List.of(new Dtos.ItemInput(id, new BigDecimal(quantity), BigDecimal.ZERO)),
        List.of(new Dtos.PaymentInput(method, new BigDecimal(amount))));
  }

  JsonNode postJson(String path, Object body) throws Exception {
    if(path.equals("/api/v1/credits/payments") && body instanceof Map<?,?> source) {
      var copy=new HashMap<Object,Object>(source); copy.putIfAbsent("requestId",UUID.randomUUID().toString()); body=copy;
    }
    return json.readTree(
        mvc.perform(
                post(path)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void saleCommitsStockPaymentAndAudit() throws Exception {
    var result = postJson("/api/v1/sales", sale(productId, "2", "20", "CASH", UUID.randomUUID()));
    assertEquals(20, result.at("/sale/total").asInt());
    assertEquals(8, products.findById(productId).orElseThrow().quantity.intValue());
    assertEquals(1, jdbc.queryForObject("select count(*) from stock_movements", Integer.class));
    assertEquals(
        1,
        jdbc.queryForObject(
            "select count(*) from audit_log where action='CHECKOUT'", Integer.class));
    mvc.perform(get("/api/v1/sales/" + result.at("/sale/id").asLong() + "/items"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].productName").value("Arroz"));
  }

  @Test
  void saleWithoutEnoughStockEndsAtZero() throws Exception {
    postJson("/api/v1/sales", sale(productId, "11", "110", "CASH", UUID.randomUUID()));
    assertEquals(0, products.findById(productId).orElseThrow().quantity.intValue());
    assertEquals(
        1,
        jdbc.queryForObject(
            "select quantity from stock_movements where product_id=? and type='ADJUSTMENT'"
                + " and reason like 'Venda sem estoque%'",
            Integer.class,
            productId));
  }

  @Test
  void paymentMismatchRollsBackStock() throws Exception {
    mvc.perform(
            post("/api/v1/sales")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsBytes(sale(productId, "2", "19", "PIX", UUID.randomUUID()))))
        .andExpect(status().isUnprocessableEntity());
    assertEquals(10, products.findById(productId).orElseThrow().quantity.intValue());
  }

  @Test
  void duplicateCheckoutReturnsSameReceipt() throws Exception {
    var input = sale(productId, "1", "10", "CASH", UUID.randomUUID());
    assertEquals(
        postJson("/api/v1/sales", input).at("/sale/id"),
        postJson("/api/v1/sales", input).at("/sale/id"));
    assertEquals(9, products.findById(productId).orElseThrow().quantity.intValue());
  }

  @Test
  void weightedProductUsesDecimalRounding() throws Exception {
    var input = sale(2L, "0.750", "5.24", "PIX", UUID.randomUUID());
    postJson("/api/v1/sales", input);
    assertEquals(
        0, new BigDecimal("9.250").compareTo(products.findById(2L).orElseThrow().quantity));
  }

  @Test
  void promotionAndDiscountApplyOnServer() throws Exception {
    jdbc.update(
        "INSERT INTO price_rules(product_id,table_name,price,starts_at,ends_at) VALUES (?,"
            + " 'WHOLESALE',8,NOW()-interval '1 day',NOW()+interval '1 day')",
        productId);
    var input =
        new Dtos.SaleInput(
            UUID.randomUUID(),
            null,
            "WHOLESALE",
            List.of(new Dtos.ItemInput(productId, new BigDecimal("2"), BigDecimal.ONE)),
            List.of(new Dtos.PaymentInput("DEBIT", new BigDecimal("15"))));
    var result = postJson("/api/v1/sales", input);
    assertEquals(15, result.at("/sale/total").asInt());
    assertEquals(8, result.at("/items/0/unitPrice").asInt());
  }

  @Test
  void splitPaymentRecordsFees() throws Exception {
    var input =
        new Dtos.SaleInput(
            UUID.randomUUID(),
            null,
            "RETAIL",
            List.of(new Dtos.ItemInput(productId, new BigDecimal("2"), BigDecimal.ZERO)),
            List.of(
                new Dtos.PaymentInput("CASH", BigDecimal.TEN),
                new Dtos.PaymentInput("CREDIT", BigDecimal.TEN)));
    var result = postJson("/api/v1/sales", input);
    assertEquals(2, result.path("payments").size());
    assertEquals(.25, result.at("/sale/fees").asDouble());
  }

  @Test
  void creditPaymentReducesOldestDebtAndBalance() throws Exception {
    postJson("/api/v1/sales", sale(productId, "3", "30", "ACCOUNT", UUID.randomUUID()));
    var result =
        postJson(
            "/api/v1/credits/payments",
            Map.of("customerId", customerId, "amount", 12, "description", "Pagamento parcial"));
    assertEquals(18, result.path("balance").asInt());
    assertEquals(
        new BigDecimal("18.00"),
        jdbc.queryForObject("select sum(remaining) from credits", BigDecimal.class));
    mvc.perform(get("/api/v1/credits").param("customerId", "" + customerId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2));
  }

  @Test
  void creditLimitFailureRollsBack() throws Exception {
    jdbc.update("update customers set credit_limit=5 where id=?", customerId);
    mvc.perform(
            post("/api/v1/sales")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsBytes(
                        sale(productId, "1", "10", "ACCOUNT", UUID.randomUUID()))))
        .andExpect(status().isUnprocessableEntity());
    assertEquals(10, products.findById(productId).orElseThrow().quantity.intValue());
    assertEquals(0, customers.findById(customerId).orElseThrow().balance.intValue());
  }

  @Test
  void overpaymentIsRejected() throws Exception {
    mvc.perform(
            post("/api/v1/credits/payments")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"requestId\":\"00000000-0000-0000-0000-000000000001\",\"customerId\":1,\"amount\":1,\"description\":\"Pagamento\"}"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void cancellationRestoresStockAndCreditExactlyOnce() throws Exception {
    var result =
        postJson("/api/v1/sales", sale(productId, "2", "20", "ACCOUNT", UUID.randomUUID()));
    var id = result.at("/sale/id").asLong();
    postJson("/api/v1/sales/" + id + "/cancel", Map.of());
    postJson("/api/v1/sales/" + id + "/cancel", Map.of());
    assertEquals(10, products.findById(productId).orElseThrow().quantity.intValue());
    assertEquals(0, customers.findById(customerId).orElseThrow().balance.intValue());
  }

  @Test
  void cancellationAfterDebtPaymentIsRejected() throws Exception {
    var id =
        postJson("/api/v1/sales", sale(productId, "1", "10", "ACCOUNT", UUID.randomUUID()))
            .at("/sale/id")
            .asLong();
    postJson(
        "/api/v1/credits/payments",
        Map.of("customerId", customerId, "amount", 1, "description", "Parcial"));
    mvc.perform(post("/api/v1/sales/" + id + "/cancel").with(csrf()))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void expiredProductCannotSell() throws Exception {
    jdbc.update("update products set expires_on=CURRENT_DATE-1 where id=?", productId);
    mvc.perform(
            post("/api/v1/sales")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsBytes(sale(productId, "1", "10", "CASH", UUID.randomUUID()))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void concurrentSalesWithoutStockNeverGoNegative() throws Exception {
    jdbc.update("update products set quantity=1 where id=?", productId);
    var executor = Executors.newFixedThreadPool(2);
    var gate = new CountDownLatch(1);
    Callable<Boolean> task =
        () -> {
          SecurityContextHolder.getContext()
              .setAuthentication(
                  new UsernamePasswordAuthenticationToken(
                      "admin", "", List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
          gate.await();
          try {
            sales.checkout(sale(productId, "1", "10", "CASH", UUID.randomUUID()));
            return true;
          } catch (BusinessException ex) {
            return false;
          } finally {
            SecurityContextHolder.clearContext();
          }
        };
    try {
      var first = executor.submit(task);
      var second = executor.submit(task);
      gate.countDown();
      assertTrue(first.get(20, TimeUnit.SECONDS));
      assertTrue(second.get(20, TimeUnit.SECONDS));
      assertEquals(0, products.findById(productId).orElseThrow().quantity.intValue());
    } finally {
      executor.shutdownNow();
    }
  }

  @Test
  void catalogCrudSearchAndStock() throws Exception {
    var result =
        mvc.perform(
                post("/api/v1/products")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(productBody("C")))
            .andExpect(status().isOk())
            .andReturn();
    long id = json.readTree(result.getResponse().getContentAsString()).path("id").asLong();
    mvc.perform(
            put("/api/v1/products/" + id)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productBody("C")))
        .andExpect(status().isOk());
    postJson(
        "/api/v1/stock-movements",
        Map.of("productId", id, "type", "IN", "quantity", 5, "reason", "Compra"));
    postJson(
        "/api/v1/stock-movements",
        Map.of("productId", id, "type", "OUT", "quantity", 1, "reason", "Perda"));
    postJson(
        "/api/v1/stock-movements",
        Map.of("productId", id, "type", "ADJUSTMENT", "quantity", 3, "reason", "Inventário"));
    assertEquals(3, products.findById(id).orElseThrow().quantity.intValue());
    mvc.perform(get("/api/v1/products").param("q", "C"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].code").value("C"));
    mvc.perform(get("/api/v1/stock-movements").param("productId", "" + id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(3));
    mvc.perform(delete("/api/v1/products/" + id).with(csrf())).andExpect(status().isOk());
    assertFalse(products.findById(id).orElseThrow().active);
  }

  @Test
  void negativeStockAndFractionalUnitsRejected() throws Exception {
    mvc.perform(
            post("/api/v1/stock-movements")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"productId\":1,\"type\":\"OUT\",\"quantity\":11,\"reason\":\"Perda\"}"))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            post("/api/v1/stock-movements")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"productId\":1,\"type\":\"IN\",\"quantity\":0.5,\"reason\":\"Compra\"}"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void categoryCrudAndConstraints() throws Exception {
    var id = postJson("/api/v1/categories", Map.of("name", "Bebidas")).path("id").asLong();
    mvc.perform(
            put("/api/v1/categories/" + id)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Limpeza\"}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/categories"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2));
    mvc.perform(delete("/api/v1/categories/1").with(csrf())).andExpect(status().isConflict());
    mvc.perform(delete("/api/v1/categories/" + id).with(csrf())).andExpect(status().isOk());
  }

  @Test
  void customerCrudAndDebtSafeguards() throws Exception {
    var id =
        postJson("/api/v1/customers", Map.of("name", "João", "creditLimit", 50))
            .path("id")
            .asLong();
    mvc.perform(
            put("/api/v1/customers/" + id)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"João Silva\",\"creditLimit\":60}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/customers").param("q", "João"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content.length()").value(1));
    mvc.perform(delete("/api/v1/customers/" + id).with(csrf())).andExpect(status().isOk());
    postJson("/api/v1/sales", sale(productId, "1", "10", "ACCOUNT", UUID.randomUUID()));
    mvc.perform(delete("/api/v1/customers/" + customerId).with(csrf()))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            put("/api/v1/customers/" + customerId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Maria\",\"creditLimit\":1}"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void overdueAndAlerts() throws Exception {
    postJson("/api/v1/sales", sale(productId, "9", "90", "ACCOUNT", UUID.randomUUID()));
    jdbc.update("update credits set due_date=CURRENT_DATE-1");
    mvc.perform(get("/api/v1/credits/overdue"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    mvc.perform(get("/api/v1/alerts"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].quantity").value(1));
  }

  @Test
  void reportExportsReflectSales() throws Exception {
    postJson("/api/v1/sales", sale(productId, "2", "20", "CASH", UUID.randomUUID()));
    String from = LocalDate.now().minusDays(1).toString(),
        to = LocalDate.now().plusDays(1).toString();
    mvc.perform(get("/api/v1/reports").param("from", from).param("to", to))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.summary.revenue").value(20))
        .andExpect(jsonPath("$.bestSellers[0].quantity").value(2));
    for (String format : List.of("pdf", "xlsx")) {
      var bytes =
          mvc.perform(
                  get("/api/v1/reports/export")
                      .param("from", from)
                      .param("to", to)
                      .param("format", format))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsByteArray();
      assertTrue(bytes.length > 200);
    }
  }

  @Test
  void importExportAndAtomicRollback() throws Exception {
    var csv =
        "code,barcode,name,categoryId,unit,price,cost,minimumStock,expiresOn\n"
            + "C,,Produto importado,1,UN,2.50,1,1,\n";
    var file =
        new org.springframework.mock.web.MockMultipartFile(
            "file",
            "produtos.csv",
            "text/csv",
            csv.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    mvc.perform(multipart("/api/v1/products/import").file(file).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(1));
    for (String format : List.of("csv", "xlsx"))
      mvc.perform(get("/api/v1/products/export").param("format", format))
          .andExpect(status().isOk());
    String invalid = csv.replace("C,,", "D,,") + "E,,Inválido,1,UN,-2,1,1,\n";
    mvc.perform(
            multipart("/api/v1/products/import")
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "file", "invalid.csv", "text/csv", invalid.getBytes()))
                .with(csrf()))
        .andExpect(status().isUnprocessableEntity());
    assertTrue(products.findByCode("D").isEmpty());
  }

  @Test
  void settingsHardwareAndAudit() throws Exception {
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"theme\":\"dark\",\"language\":\"en\",\"store.name\":\"Teste\",\"fee.PIX\":\"0\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.theme").value("dark"));
    long printer =
        postJson("/api/v1/printers", Map.of("name", "Epson", "type", "USB", "address", "local"))
            .path("id")
            .asLong();
    long scale =
        postJson("/api/v1/scales", Map.of("name", "Balança", "type", "MOCK", "address", "COM1"))
            .path("id")
            .asLong();
    mvc.perform(get("/api/v1/printers")).andExpect(status().isOk());
    mvc.perform(get("/api/v1/scales")).andExpect(status().isOk());
    mvc.perform(get("/api/v1/scale/weight"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.simulated").value(true));
    mvc.perform(delete("/api/v1/printers/" + printer).with(csrf())).andExpect(status().isOk());
    mvc.perform(delete("/api/v1/scales/" + scale).with(csrf())).andExpect(status().isOk());
    mvc.perform(get("/api/v1/audit-log"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content").isArray());
  }

  @Test
  void usersHidePasswordAndHashIt() throws Exception {
    var result =
        postJson(
            "/api/v1/users",
            Map.of("username", "caixa", "password", "strong-password", "role", "CASHIER"));
    assertFalse(result.has("password"));
    String hash =
        jdbc.queryForObject("select password from users where username='caixa'", String.class);
    assertTrue(passwords.matches("strong-password", hash));
    mvc.perform(get("/api/v1/users"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].password").doesNotExist());
  }

  @Test
  void loginIssuesJwtAndRejectsWrongPassword() throws Exception {
    var result =
        postJson(
            "/api/v1/auth/login", Map.of("username", "admin", "password", "integration-password"));
    assertEquals("ADMIN", result.path("role").asText());
    assertEquals(3, result.path("token").asText().split("\\.").length);
    mvc.perform(
            post("/api/v1/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  @org.springframework.security.test.context.support.WithAnonymousUser
  void anonymousCannotReadBusinessData() throws Exception {
    mvc.perform(get("/api/v1/products")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/auth/csrf"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.token").exists());
  }

  @Test
  void missingCsrfIsRejected() throws Exception {
    mvc.perform(
            post("/api/v1/products")
                .contentType(MediaType.APPLICATION_JSON)
                .content(productBody("X")))
        .andExpect(status().isForbidden());
  }

  @Test
  @WithMockUser(username = "admin", roles = "CASHIER")
  void cashierCannotManageProductsReportsOrBackup() throws Exception {
    mvc.perform(
            post("/api/v1/products")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productBody("X")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/reports").param("from", "2026-01-01").param("to", "2026-01-02"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/backup")).andExpect(status().isForbidden());
  }

  @Test
  void invalidDtoAndDuplicateCodeAreRejected() throws Exception {
    mvc.perform(
            post("/api/v1/products")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/products")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productBody("A")))
        .andExpect(status().isConflict());
    mvc.perform(get("/api/v1/products/9999")).andExpect(status().isNotFound());
  }

  @Test
  void priceRuleCrud() throws Exception {
    var rule =
        postJson(
            "/api/v1/price-rules",
            Map.of(
                "productId",
                productId,
                "tableName",
                "RETAIL",
                "price",
                7,
                "startsAt",
                Instant.now().minusSeconds(30).toString(),
                "endsAt",
                Instant.now().plusSeconds(600).toString()));
    mvc.perform(get("/api/v1/products/" + productId + "/price"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.price").value(7));
    mvc.perform(get("/api/v1/price-rules"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    mvc.perform(delete("/api/v1/price-rules/" + rule.path("id").asLong()).with(csrf()))
        .andExpect(status().isOk());
  }

  @Test
  void bearerTokenStillRequiresCsrf() throws Exception {
    var token =
        postJson(
                "/api/v1/auth/login",
                Map.of("username", "admin", "password", "integration-password"))
            .path("token")
            .asText();
    mvc.perform(
            post("/api/v1/categories")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"CSRF attack\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/v1/categories")
                .header("Authorization", "Bearer " + token)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Allowed\"}"))
        .andExpect(status().isOk());
  }

  @Test
  void idempotencyKeyCannotBeReusedForDifferentSale() throws Exception {
    var key = UUID.randomUUID();
    postJson("/api/v1/sales", sale(productId, "1", "10", "CASH", key));
    mvc.perform(
            post("/api/v1/sales")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(sale(productId, "2", "20", "CASH", key))))
        .andExpect(status().isUnprocessableEntity());
    assertEquals(9, products.findById(productId).orElseThrow().quantity.intValue());
  }

  @Test
  void excelRoundTripAndInvalidFormats() throws Exception {
    var bytes =
        mvc.perform(get("/api/v1/products/export").param("format", "xlsx"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    mvc.perform(
            multipart("/api/v1/products/import")
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "file", "products.xlsx", "application/octet-stream", bytes))
                .with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(2));
    mvc.perform(
            multipart("/api/v1/products/import")
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "file", "bad.txt", "text/plain", new byte[] {1}))
                .with(csrf()))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(get("/api/v1/products/export").param("format", "bad"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void repeatedPaymentSettlesOldestDebtFirst() throws Exception {
    postJson("/api/v1/sales", sale(productId, "1", "10", "ACCOUNT", UUID.randomUUID()));
    postJson("/api/v1/sales", sale(productId, "2", "20", "ACCOUNT", UUID.randomUUID()));
    postJson(
        "/api/v1/credits/payments",
        Map.of("customerId", customerId, "amount", 15, "description", "Pagamento"));
    assertEquals(new BigDecimal("15.00"), customers.findById(customerId).orElseThrow().balance);
    assertEquals(
        new BigDecimal("0.00"),
        jdbc.queryForObject("select remaining from credits where amount=10", BigDecimal.class));
  }

  @Test
  void rejectsInvalidSettingsAndRules() throws Exception {
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fee.CREDIT\":\"101\"}"))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"theme\":\"invalid\"}"))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"unknown\":\"x\"}"))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(get("/api/v1/reports").param("from", "2026-02-01").param("to", "2026-01-01"))
        .andExpect(status().isUnprocessableEntity());
  }

 @Test void creditPaymentRetryDoesNotReduceBalanceTwice() throws Exception {
  postJson("/api/v1/sales",sale(productId,"3","30","ACCOUNT",UUID.randomUUID()));
  var body=Map.of("customerId",customerId,"requestId",UUID.randomUUID().toString(),"amount",10,"description","Pagamento");
  postJson("/api/v1/credits/payments",body);postJson("/api/v1/credits/payments",body);
  assertEquals(new BigDecimal("20.00"),customers.findById(customerId).orElseThrow().balance);
  assertEquals(1,jdbc.queryForObject("select count(*) from credits where amount<0",Integer.class));
 }

  long drawerId() {
    return jdbc.queryForObject(
        "select id from cash_sessions where status='OPEN' order by id desc limit 1", Long.class);
  }

  void expectStatus(String path, Object body, int status) throws Exception {
    mvc.perform(
            post(path)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(body)))
        .andExpect(status().is(status));
  }

  @Test
  void checkoutRequiresOpenDrawer() throws Exception {
    jdbc.execute("TRUNCATE TABLE cash_sessions CASCADE");
    mvc.perform(get("/api/v1/cash/current")).andExpect(status().isNoContent());
    expectStatus("/api/v1/sales", sale(productId, "1", "10", "CASH", UUID.randomUUID()), 422);
    assertEquals(10, products.findById(productId).orElseThrow().quantity.intValue());
  }

  @Test
  void drawerTracksSalesMovementsAndClosingDifference() throws Exception {
    jdbc.execute("TRUNCATE TABLE cash_sessions CASCADE");
    var opened = postJson("/api/v1/cash/open", Map.of("openingAmount", 100));
    var id = opened.at("/session/id").asLong();
    expectStatus("/api/v1/cash/open", Map.of("openingAmount", 5), 422);
    postJson(
        "/api/v1/sales",
        new Dtos.SaleInput(
            UUID.randomUUID(),
            null,
            "RETAIL",
            List.of(new Dtos.ItemInput(productId, new BigDecimal("3"), BigDecimal.ZERO)),
            List.of(
                new Dtos.PaymentInput("CASH", new BigDecimal("20")),
                new Dtos.PaymentInput("PIX", BigDecimal.TEN))));
    var cancelled =
        postJson("/api/v1/sales", sale(productId, "1", "10", "CASH", UUID.randomUUID()))
            .at("/sale/id")
            .asLong();
    postJson("/api/v1/sales/" + cancelled + "/cancel", Map.of());
    var base = "/api/v1/cash/sessions/" + id;
    postJson(base + "/movements", Map.of("type", "SUPPLY", "amount", 50, "reason", "Troco"));
    expectStatus(
        base + "/movements", Map.of("type", "WITHDRAWAL", "amount", 171, "reason", "Cofre"), 422);
    var summary =
        postJson(
            base + "/movements", Map.of("type", "WITHDRAWAL", "amount", 30, "reason", "Cofre"));
    assertEquals(1, summary.path("sales").asInt());
    assertEquals(1, summary.path("cancelled").asInt());
    assertEquals(0, new BigDecimal("30.00").compareTo(summary.path("salesTotal").decimalValue()));
    assertEquals(
        0, new BigDecimal("140.00").compareTo(summary.path("expectedCash").decimalValue()));
    assertEquals(2, summary.path("payments").size());
    var closed = postJson(base + "/close", Map.of("countedCash", 139, "notes", "Falta moeda"));
    assertEquals("CLOSED", closed.at("/session/status").asText());
    assertEquals(
        0, new BigDecimal("-1.00").compareTo(closed.at("/session/difference").decimalValue()));
    expectStatus(base + "/close", Map.of("countedCash", 139), 422);
    expectStatus("/api/v1/sales", sale(productId, "1", "10", "CASH", UUID.randomUUID()), 422);
    assertEquals(
        1,
        jdbc.queryForObject(
            "select count(*) from audit_log where action='CASH_CLOSE'", Integer.class));
    postJson("/api/v1/cash/open", Map.of("openingAmount", 0));
  }

  @Test
  void cancellingSaleFromClosedDrawerRefundsFromCurrentDrawer() throws Exception {
    var sold =
        postJson("/api/v1/sales", sale(productId, "2", "20", "CASH", UUID.randomUUID()))
            .at("/sale/id")
            .asLong();
    postJson("/api/v1/cash/sessions/" + drawerId() + "/close", Map.of("countedCash", 20));
    postJson("/api/v1/cash/open", Map.of("openingAmount", 5));
    expectStatus("/api/v1/sales/" + sold + "/cancel", Map.of(), 422);
    assertEquals(8, products.findById(productId).orElseThrow().quantity.intValue());
    postJson(
        "/api/v1/cash/sessions/" + drawerId() + "/movements",
        Map.of("type", "SUPPLY", "amount", 20, "reason", "Troco"));
    postJson("/api/v1/sales/" + sold + "/cancel", Map.of());
    var current =
        json.readTree(
            mvc.perform(get("/api/v1/cash/current"))
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertEquals(0, new BigDecimal("5.00").compareTo(current.path("expectedCash").decimalValue()));
    assertEquals("Estorno venda #" + sold, current.at("/movements/1/reason").asText());
  }

  @Test
  void cashierCannotSeeAnotherOperatorsDrawer() throws Exception {
    postJson(
        "/api/v1/users",
        Map.of("username", "caixa", "password", "strong-password", "role", "CASHIER"));
    var cashier =
        org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
            .user("caixa")
            .roles("CASHIER");
    mvc.perform(get("/api/v1/cash/sessions/" + drawerId()).with(cashier))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/cash/sessions").with(cashier))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(0));
    mvc.perform(get("/api/v1/cash/sessions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1));
  }

  long lotId(String expiresOnSql) {
    return jdbc.queryForObject(
        "select id from stock_lots where expires_on=" + expiresOnSql + " order by id limit 1",
        Long.class);
  }

  @Test
  void lotsSellFirstExpiringAndBlockExpiredGoods() throws Exception {
    var soon = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusDays(10).toString();
    var past = LocalDate.now(ZoneId.of("America/Sao_Paulo")).minusDays(1).toString();
    postJson(
        "/api/v1/lots", Map.of("productId", productId, "quantity", 4, "expiresOn", past));
    postJson(
        "/api/v1/lots", Map.of("productId", productId, "quantity", 6, "expiresOn", soon));
    expectStatus("/api/v1/lots", Map.of("productId", productId, "quantity", 1), 422);
    expectStatus("/api/v1/sales", sale(productId, "7", "70", "CASH", UUID.randomUUID()), 422);
    var sold =
        postJson("/api/v1/sales", sale(productId, "6", "60", "CASH", UUID.randomUUID()))
            .at("/sale/id")
            .asLong();
    assertEquals(
        0,
        jdbc.queryForObject(
            "select quantity from stock_lots where id=?", BigDecimal.class, lotId("CURRENT_DATE+10"))
            .signum());
    assertEquals(
        LocalDate.parse(past),
        jdbc.queryForObject("select expires_on from products where id=?", LocalDate.class, productId));
    var loss =
        postJson(
            "/api/v1/writeoffs",
            Map.of(
                "kind",
                "LOSS",
                "reason",
                "Validade vencida",
                "items",
                List.of(Map.of("productId", productId, "quantity", 4, "lotId", lotId("CURRENT_DATE-1")))));
    assertEquals(0, new BigDecimal("20.00").compareTo(loss.path("totalCost").decimalValue()));
    assertEquals(0, products.findById(productId).orElseThrow().quantity.signum());
    assertNull(products.findById(productId).orElseThrow().expiresOn);
    postJson("/api/v1/sales/" + sold + "/cancel", Map.of());
    assertEquals(6, products.findById(productId).orElseThrow().quantity.intValue());
    assertEquals(
        0,
        new BigDecimal("6")
            .compareTo(
                jdbc.queryForObject(
                    "select quantity from stock_lots where id=?",
                    BigDecimal.class,
                    lotId("CURRENT_DATE+10"))));
    assertEquals(
        LocalDate.parse(soon),
        jdbc.queryForObject("select expires_on from products where id=?", LocalDate.class, productId));
  }

  @Test
  void perishableEntryNeedsExpiryAndAveragesCost() throws Exception {
    jdbc.update("update products set perishable=true where id=?", productId);
    var entry = new HashMap<String, Object>();
    entry.put("productId", productId);
    entry.put("type", "IN");
    entry.put("quantity", 10);
    entry.put("reason", "NF 123");
    entry.put("unitCost", 7);
    expectStatus("/api/v1/stock-movements", entry, 422);
    entry.put("expiresOn", LocalDate.now().plusDays(5).toString());
    postJson("/api/v1/stock-movements", entry);
    var product = products.findById(productId).orElseThrow();
    assertEquals(0, new BigDecimal("6.00").compareTo(product.cost));
    assertEquals(20, product.quantity.intValue());
    mvc.perform(get("/api/v1/lots").param("productId", "" + productId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].quantity").value(10));
    // Only 10 of the 20 units have a dated lot, so a perishable cannot sell 11.
    expectStatus("/api/v1/sales", sale(productId, "11", "110", "CASH", UUID.randomUUID()), 422);
    postJson("/api/v1/sales", sale(productId, "10", "100", "CASH", UUID.randomUUID()));
  }

  @Test
  void internalUseInventoryAndPriceHistory() throws Exception {
    expectStatus(
        "/api/v1/writeoffs",
        Map.of(
            "kind",
            "INTERNAL",
            "reason",
            "Validade vencida",
            "items",
            List.of(Map.of("productId", 2, "quantity", 1))),
        422);
    var used =
        postJson(
            "/api/v1/writeoffs",
            Map.of(
                "kind",
                "INTERNAL",
                "reason",
                "Limpeza",
                "items",
                List.of(Map.of("productId", 2, "quantity", 1.5))));
    assertEquals(0, new BigDecimal("4.50").compareTo(used.path("totalCost").decimalValue()));
    assertEquals(
        0, new BigDecimal("8.500").compareTo(products.findById(2L).orElseThrow().quantity));
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
    mvc.perform(
            get("/api/v1/writeoffs/summary")
                .param("kind", "INTERNAL")
                .param("from", today)
                .param("to", today))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.month").value(4.50))
        .andExpect(jsonPath("$.byReason[0].reason").value("Limpeza"));
    mvc.perform(get("/api/v1/writeoffs").param("kind", "INTERNAL"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].items[0].productName").value("Banana"));
    mvc.perform(get("/api/v1/reports").param("from", today).param("to", today))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.writeoffs[0].kind").value("INTERNAL"));
    postJson(
        "/api/v1/stock-movements",
        Map.of("productId", productId, "type", "ADJUSTMENT", "quantity", 7, "reason", "Contagem"));
    mvc.perform(get("/api/v1/inventory-counts").param("productId", "" + productId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].difference").value(-3))
        .andExpect(jsonPath("$[0].costImpact").value(-15));
    mvc.perform(
            put("/api/v1/products/" + productId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productBody("A")))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/products/" + productId + "/price-history"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].previous").value(10))
        .andExpect(jsonPath("$[0].current").value(4.5));
  }

  long supplier(String name) throws Exception {
    return postJson("/api/v1/suppliers", Map.of("name", name)).path("id").asLong();
  }

  Map<String, Object> purchaseBody(long supplierId, String document, UUID request, List<?> items) {
    return Map.of(
        "requestId", request.toString(),
        "supplierId", supplierId,
        "document", document,
        "dueDate", LocalDate.now().plusDays(28).toString(),
        "payment", "TERM",
        "items", items);
  }

  @Test
  void purchaseReceivesStockAverageCostLotsAndNewPrice() throws Exception {
    var supplierId = supplier("Atacadão");
    expectStatus("/api/v1/suppliers", Map.of("name", "atacadão"), 422);
    var soon = LocalDate.now().plusDays(20).toString();
    var request = UUID.randomUUID();
    var items =
        List.of(
            Map.of("productId", productId, "quantity", 10, "unitCost", 7, "expiresOn", soon, "newPrice", 12),
            Map.of("productId", 2, "quantity", 2.5, "unitCost", 4));
    var purchase = postJson("/api/v1/purchases", purchaseBody(supplierId, "NF-1", request, items));
    assertEquals(0, new BigDecimal("80.00").compareTo(purchase.path("total").decimalValue()));
    assertEquals(2, purchase.path("items").size());
    assertEquals(
        purchase.path("id").asLong(),
        postJson("/api/v1/purchases", purchaseBody(supplierId, "NF-1", request, items))
            .path("id")
            .asLong());
    expectStatus(
        "/api/v1/purchases", purchaseBody(supplierId, "nf-1", UUID.randomUUID(), items), 422);
    expectStatus(
        "/api/v1/purchases",
        purchaseBody(
            supplierId,
            "NF-2",
            UUID.randomUUID(),
            List.of(
                Map.of(
                    "productId", productId, "quantity", 1, "unitCost", 1,
                    "expiresOn", LocalDate.now().minusDays(1).toString()))),
        422);
    var arroz = products.findById(productId).orElseThrow();
    assertEquals(20, arroz.quantity.intValue());
    assertEquals(0, new BigDecimal("6.00").compareTo(arroz.cost));
    assertEquals(0, new BigDecimal("12.00").compareTo(arroz.price));
    assertEquals(LocalDate.parse(soon), arroz.expiresOn);
    var banana = products.findById(2L).orElseThrow();
    assertEquals(0, new BigDecimal("12.500").compareTo(banana.quantity));
    assertEquals(0, new BigDecimal("3.20").compareTo(banana.cost));
    assertEquals(
        2,
        jdbc.queryForObject(
            "select count(*) from stock_movements where type='PURCHASE'", Integer.class));
    mvc.perform(get("/api/v1/purchases"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].supplier").value("Atacadão"));
  }

  @Test
  void productionConsumesInputsAtCostAndCreatesLot() throws Exception {
    jdbc.update(
        "INSERT INTO products(code,name,unit,price,cost,quantity,minimum_stock) VALUES"
            + " ('P','Pão caseiro','UN',1,0,0,0)");
    var bread = jdbc.queryForObject("select id from products where code='P'", Long.class);
    var recipe =
        Map.of(
            "productId", bread,
            "yield", 10,
            "items",
            List.of(Map.of("inputId", productId, "quantity", 1), Map.of("inputId", 2, "quantity", 0.5)));
    var recipeId = postJson("/api/v1/recipes", recipe).path("id").asLong();
    expectStatus("/api/v1/recipes", recipe, 422);
    expectStatus(
        "/api/v1/recipes",
        Map.of(
            "productId", productId,
            "yield", 1,
            "items", List.of(Map.of("inputId", productId, "quantity", 1))),
        422);
    mvc.perform(get("/api/v1/recipes"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].batchCost").value(6.5))
        .andExpect(jsonPath("$[0].items.length()").value(2));
    var expires = LocalDate.now().plusDays(2).toString();
    expectStatus(
        "/api/v1/productions",
        Map.of("recipeId", recipeId, "multiplier", 0.5, "expiresOn", expires),
        422);
    var made =
        postJson(
            "/api/v1/productions",
            Map.of("recipeId", recipeId, "multiplier", 2, "expiresOn", expires));
    assertEquals(0, new BigDecimal("13.00").compareTo(made.path("totalCost").decimalValue()));
    var product = products.findById(bread).orElseThrow();
    assertEquals(20, product.quantity.intValue());
    assertEquals(0, new BigDecimal("0.65").compareTo(product.cost));
    assertTrue(product.perishable);
    assertEquals(LocalDate.parse(expires), product.expiresOn);
    assertEquals(8, products.findById(productId).orElseThrow().quantity.intValue());
    assertEquals(
        0, new BigDecimal("9.000").compareTo(products.findById(2L).orElseThrow().quantity));
    mvc.perform(get("/api/v1/productions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].inputs.length()").value(2));
  }

  @Test
  void pricingSettingsAndCategoryMarkup() throws Exception {
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pricing.markup\":\"40\",\"pricing.rounding\":\"0.05\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$['pricing.rounding']").value("0.05"));
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"receipt.autoPrint\":\"false\",\"receipt.copies\":\"2\","
                        + "\"store.cnpj\":\"12.345.678/0001-90\",\"store.footer\":\"Volte sempre\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$['receipt.copies']").value("2"));
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"receipt.copies\":\"5\"}"))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pricing.rounding\":\"0.07\"}"))
        .andExpect(status().isUnprocessableEntity());
    assertEquals(
        45,
        postJson("/api/v1/categories", Map.of("name", "Padaria", "markup", 45))
            .path("markup")
            .asInt());
  }

  BigDecimal balance(String kind) {
    return jdbc.queryForObject(
        "SELECT a.opening_balance+coalesce(sum(e.amount),0) FROM financial_accounts a LEFT JOIN"
            + " ledger_entries e ON e.account_id=a.id WHERE a.kind=? GROUP BY a.id ORDER BY a.id"
            + " LIMIT 1",
        BigDecimal.class,
        kind);
  }

  long accountId(String kind) {
    return jdbc.queryForObject(
        "SELECT id FROM financial_accounts WHERE kind=? ORDER BY id LIMIT 1", Long.class, kind);
  }

  JsonNode getJson(String path, String... params) throws Exception {
    var request = get(path);
    for (int i = 0; i < params.length; i += 2) request = request.param(params[i], params[i + 1]);
    return json.readTree(
        mvc.perform(request)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void salesFeedCashBankCardReceivablesAndDre() throws Exception {
    postJson(
        "/api/v1/sales",
        new Dtos.SaleInput(
            UUID.randomUUID(),
            null,
            "RETAIL",
            List.of(new Dtos.ItemInput(productId, new BigDecimal("2"), BigDecimal.ZERO)),
            List.of(
                new Dtos.PaymentInput("CASH", BigDecimal.TEN),
                new Dtos.PaymentInput("CREDIT", BigDecimal.TEN))));
    var pix =
        postJson("/api/v1/sales", sale(productId, "1", "10", "PIX", UUID.randomUUID()))
            .at("/sale/id")
            .asLong();
    assertEquals(0, BigDecimal.TEN.compareTo(balance("CASH")));
    assertEquals(0, BigDecimal.TEN.compareTo(balance("BANK")));
    var receivables = getJson("/api/v1/finance/card-receivables");
    assertEquals(1, receivables.size());
    assertEquals(0.25, receivables.at("/0/fee").asDouble());
    postJson(
        "/api/v1/finance/card-receivables/" + receivables.at("/0/id").asLong() + "/settle",
        Map.of("fee", 0.30));
    assertEquals(0, new BigDecimal("19.70").compareTo(balance("BANK")));
    postJson("/api/v1/sales/" + pix + "/cancel", Map.of());
    assertEquals(0, new BigDecimal("9.70").compareTo(balance("BANK")));
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
    var dre = getJson("/api/v1/finance/dre", "from", today, "to", today);
    assertEquals(20, dre.path("revenue").asInt());
    assertEquals(0.30, dre.path("fees").asDouble());
    assertEquals(10, dre.path("cogs").asInt());
    assertEquals(9.70, dre.path("grossProfit").asDouble());
    var flow = getJson("/api/v1/finance/cashflow", "from", today, "to", today);
    assertEquals(19.70, flow.path("net").asDouble());
  }

  @Test
  void payablesFromPurchasesAndExpensesWithPartialPaymentAndReversal() throws Exception {
    var supplierId = supplier("Distribuidora");
    postJson(
        "/api/v1/purchases",
        purchaseBody(
            supplierId,
            "NF-10",
            UUID.randomUUID(),
            List.of(Map.of("productId", productId, "quantity", 5, "unitCost", 4))));
    var cash = new HashMap<>(
        purchaseBody(
            supplierId,
            "NF-11",
            UUID.randomUUID(),
            List.of(Map.of("productId", productId, "quantity", 5, "unitCost", 6))));
    cash.put("payment", "CASH");
    postJson("/api/v1/purchases", cash);
    assertEquals(0, new BigDecimal("-30.00").compareTo(balance("BANK")));
    var open = getJson("/api/v1/finance/payables");
    assertEquals(1, open.size());
    assertEquals("Mercadoria para revenda", open.at("/0/category").asText());
    assertEquals(20, open.at("/0/balance").asInt());
    var rent =
        postJson(
                "/api/v1/finance/payables",
                Map.of(
                    "supplierId", supplierId,
                    "description", "Aluguel setembro",
                    "category", "Aluguel",
                    "amount", 1000,
                    "dueDate", LocalDate.now().plusDays(5).toString()))
            .path("id")
            .asLong();
    expectStatus(
        "/api/v1/finance/payables",
        Map.of(
            "supplierId", supplierId,
            "description", "x",
            "category", "Inventada",
            "amount", 1,
            "dueDate", LocalDate.now().toString()),
        422);
    var payment =
        Map.of(
            "requestId", UUID.randomUUID().toString(),
            "principal", 400,
            "charges", 10,
            "accountId", accountId("CASH"),
            "method", "Dinheiro");
    var paymentId =
        postJson("/api/v1/finance/payables/" + rent + "/payments", payment).path("id").asLong();
    postJson("/api/v1/finance/payables/" + rent + "/payments", payment);
    assertEquals(0, new BigDecimal("-410.00").compareTo(balance("CASH")));
    expectStatus(
        "/api/v1/finance/payables/" + rent + "/payments",
        Map.of(
            "requestId", UUID.randomUUID().toString(),
            "principal", 700,
            "accountId", accountId("CASH"),
            "method", "Pix"),
        422);
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
    var dre = getJson("/api/v1/finance/dre", "from", today, "to", today);
    assertEquals("Aluguel", dre.at("/expenses/0/category").asText());
    assertEquals(10, dre.path("chargesPaid").asInt());
    expectStatus("/api/v1/finance/payables/" + rent + "/cancel", Map.of("reason", "Erro"), 422);
    postJson(
        "/api/v1/finance/payable-payments/" + paymentId + "/reverse", Map.of("reason", "Erro"));
    assertEquals(0, balance("CASH").signum());
    postJson("/api/v1/finance/payables/" + rent + "/cancel", Map.of("reason", "Lançada errado"));
    assertEquals(0, getJson("/api/v1/finance/dre", "from", today, "to", today).path("expenses").size());
  }

  @Test
  void fiadoChargesInterestAndCashGoesToDrawer() throws Exception {
    jdbc.update("update customers set interest_day=1 where id=?", customerId);
    postJson("/api/v1/sales", sale(productId, "2", "20", "ACCOUNT", UUID.randomUUID()));
    jdbc.update("update credits set due_date=CURRENT_DATE-10 where customer_id=?", customerId);
    var titles = getJson("/api/v1/customers/" + customerId + "/titles");
    assertEquals(2.0, titles.path("charges").asDouble());
    postJson(
        "/api/v1/credits/payments",
        Map.of("customerId", customerId, "amount", 10, "description", "Parcial", "method", "CASH"));
    assertEquals(0, new BigDecimal("11.00").compareTo(balance("CASH")));
    var drawer = getJson("/api/v1/cash/current");
    assertEquals(11, drawer.path("creditReceipts").asInt());
    assertEquals(11, drawer.path("expectedCash").asInt());
    postJson(
        "/api/v1/credits/payments",
        Map.of(
            "customerId", customerId,
            "amount", 10,
            "description", "Quitação",
            "method", "PIX",
            "waiveCharges", true));
    assertEquals(0, BigDecimal.TEN.compareTo(balance("BANK")));
    assertEquals(0, customers.findById(customerId).orElseThrow().balance.signum());
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
    assertEquals(
        1.0,
        getJson("/api/v1/finance/dre", "from", today, "to", today)
            .path("interestReceived")
            .asDouble());
    // Closing counted R$ 10 against R$ 11 expected posts the shortage to the cash account.
    postJson("/api/v1/cash/sessions/" + drawerId() + "/close", Map.of("countedCash", 10));
    assertEquals(0, BigDecimal.TEN.compareTo(balance("CASH")));
  }

  @Test
  void transfersManualEntriesAndBankReconciliation() throws Exception {
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString();
    var bank = accountId("BANK");
    var cash = accountId("CASH");
    var entry =
        postJson(
                "/api/v1/finance/entries",
                Map.of(
                    "type", "IN", "accountId", cash, "amount", 500, "date", today,
                    "category", "Aporte do dono", "description", "Capital inicial"))
            .path("id")
            .asLong();
    expectStatus(
        "/api/v1/finance/entries",
        Map.of(
            "type", "IN", "accountId", cash, "amount", 5, "date", today,
            "category", "Despesa avulsa", "description", "x"),
        422);
    postJson(
        "/api/v1/finance/transfers",
        Map.of("fromAccountId", cash, "toAccountId", bank, "amount", 300, "date", today));
    assertEquals(0, new BigDecimal("200.00").compareTo(balance("CASH")));
    assertEquals(0, new BigDecimal("300.00").compareTo(balance("BANK")));
    var file =
        new org.springframework.mock.web.MockMultipartFile(
            "file",
            "extrato.csv",
            "text/csv",
            ("data;descricao;valor;identificador\n"
                    + today + ";DEP DINHEIRO;300,00;A1\n"
                    + today + ";TARIFA;-12,50;A2\n")
                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    for (int i = 0; i < 2; i++)
      mvc.perform(
              multipart("/api/v1/finance/statements/import")
                  .file(file)
                  .param("accountId", "" + bank)
                  .with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.imported").value(i == 0 ? 2 : 0));
    var lines = getJson("/api/v1/finance/statements", "accountId", "" + bank);
    var deposit = lines.get(0).path("amount").asDouble() == 300 ? lines.get(0) : lines.get(1);
    var candidate = deposit.at("/candidates/0/id").asLong();
    mvc.perform(
            post("/api/v1/finance/statements/" + deposit.path("id").asLong() + "/match")
                .param("entryId", "" + candidate)
                .with(csrf()))
        .andExpect(status().isOk());
    assertTrue(
        jdbc.queryForObject("select reconciled from ledger_entries where id=?", Boolean.class, candidate));
    postJson("/api/v1/finance/entries/" + entry + "/reverse", Map.of("reason", "Duplicado"));
    expectStatus("/api/v1/finance/entries/" + entry + "/reverse", Map.of("reason", "De novo"), 422);
    assertEquals(0, new BigDecimal("-300.00").compareTo(balance("CASH")));
    var overview = getJson("/api/v1/finance/overview");
    assertEquals(2, overview.path("accounts").size());
  }

  @Autowired CalendarService calendar;

  @Test
  void bottlesLentAndReturnedPerCustomer() throws Exception {
    postJson(
        "/api/v1/customers/" + customerId + "/bottles",
        Map.of("type", "Coca 2L", "quantity", 3, "direction", "TAKEN"));
    var result =
        postJson(
            "/api/v1/customers/" + customerId + "/bottles",
            Map.of("type", "Coca 2L", "quantity", 1, "direction", "RETURNED", "note", "Trouxe"));
    assertEquals(2, result.at("/balances/0/balance").asInt());
    assertEquals(2, result.path("history").size());
    expectStatus(
        "/api/v1/customers/" + customerId + "/bottles",
        Map.of("type", "Coca", "quantity", 1, "direction", "LOST"),
        400);
    mvc.perform(get("/api/v1/bottles"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].name").value("Maria"))
        .andExpect(jsonPath("$[0].total").value(2));
  }

  @Test
  void calendarClassifiesHolidaysEvesPaydaysAndWeekends() {
    assertEquals(LocalDate.of(2026, 4, 5), CalendarService.easter(2026));
    assertEquals(CalendarService.HOLIDAY, calendar.classify(LocalDate.of(2026, 12, 25)));
    assertEquals(CalendarService.EVE, calendar.classify(LocalDate.of(2026, 12, 24)));
    assertEquals(CalendarService.PAYDAY, calendar.classify(LocalDate.of(2026, 9, 15)));
    // 7 September is a holiday, so the 5th business day moves to the 8th.
    assertEquals(LocalDate.of(2026, 9, 8), calendar.fifthBusinessDay(2026, 9));
    assertEquals(CalendarService.WEEKEND, calendar.classify(LocalDate.of(2026, 9, 26)));
    assertEquals(CalendarService.NORMAL, calendar.classify(LocalDate.of(2026, 9, 23)));
  }

  @Test
  void analyticsAndCatalogExport() throws Exception {
    postJson("/api/v1/sales", sale(productId, "2", "20", "CASH", UUID.randomUUID()));
    postJson("/api/v1/sales", sale(2L, "1", "6.99", "PIX", UUID.randomUUID()));
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    var result = getJson("/api/v1/reports/analytics", "from", today.toString(), "to", today.toString());
    assertEquals(
        2, result.path("byWeekday").get(today.getDayOfWeek().getValue() - 1).path("sales").asInt());
    assertEquals(24, result.path("byHour").size());
    assertEquals("Teste", result.at("/byCategory/0/category").asText());
    assertEquals("Arroz", result.at("/abc/0/name").asText());
    assertEquals("A", result.at("/abc/0/class").asText());
    // Banana starts at 74% of the cumulative revenue, still inside class A.
    assertEquals("A", result.at("/abc/1/class").asText());
    mvc.perform(
            put("/api/v1/settings")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"calendar.localHolidays\":\"--13-45\"}"))
        .andExpect(status().isUnprocessableEntity());
    var bytes =
        mvc.perform(get("/api/v1/products/catalog"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (var workbook =
        new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(bytes))) {
      var sheet = workbook.getSheetAt(0);
      var names = new ArrayList<String>();
      sheet.forEach(row -> names.add(row.getCell(0).getStringCellValue()));
      assertTrue(names.contains("Arroz"));
      assertTrue(names.contains("TESTE"));
    }
  }

  String productWithUnit(String code, String name, String unit) {
    return "{\"code\":\"" + code + "\",\"name\":\"" + name + "\",\"unit\":\"" + unit
        + "\",\"categoryId\":1,\"price\":10,\"cost\":5,\"minimumStock\":2}";
  }

  @Test
  void unitCanChangeWhenStockAllowsIt() throws Exception {
    // Pão cadastrado como UN que na verdade é vendido por peso.
    mvc.perform(
            put("/api/v1/products/" + productId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productWithUnit("A", "Arroz", "KG")))
        .andExpect(status().isOk());
    postJson("/api/v1/sales", sale(productId, "0.5", "5", "CASH", UUID.randomUUID()));
    assertEquals(
        0, new BigDecimal("9.500").compareTo(products.findById(productId).orElseThrow().quantity));
    // 9,5 kg não pode virar UN.
    mvc.perform(
            put("/api/v1/products/" + productId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productWithUnit("A", "Arroz", "UN")))
        .andExpect(status().isUnprocessableEntity());
    // Banana com 10 kg inteiros pode virar UN.
    mvc.perform(
            put("/api/v1/products/2")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(productWithUnit("B", "Banana", "UN")))
        .andExpect(status().isOk());
    assertEquals(
        2, jdbc.queryForObject("select count(*) from audit_log where action='UNIT'", Integer.class));
  }

  Map<String, Object> bill(long supplierId, String description, Object amount, LocalDate due) {
    var body = new HashMap<String, Object>();
    body.put("supplierId", supplierId);
    body.put("description", description);
    body.put("category", "Aluguel");
    body.put("amount", amount);
    body.put("dueDate", due.toString());
    return body;
  }

  @Test
  void billsRecurringInstallmentsStatusFiltersAndPlan() throws Exception {
    var today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
    var supplierId = supplier("Imobiliária");
    // Aluguel recorrente: 12 contas, uma por mês, cada uma com competência no seu mês.
    var rent = bill(supplierId, "Aluguel", 1500, today.plusDays(5));
    rent.put("repeat", "MONTHLY");
    rent.put("times", 12);
    rent.put("note", "Contrato 2026");
    assertEquals(12, postJson("/api/v1/finance/payables", rent).path("ids").size());
    // Parcelado: 100 em 3 vezes = 33,33 + 33,33 + 33,34 a cada 30 dias.
    var fridge = bill(supplierId, "Freezer", 100, today.minusDays(1));
    fridge.put("repeat", "INSTALLMENTS");
    fridge.put("times", 3);
    fridge.put("category", "Investimento");
    postJson("/api/v1/finance/payables", fridge);
    // Conta avulsa vencendo hoje, com linha digitável.
    var energy = bill(supplierId, "Energia", 200, today);
    energy.put("category", "Energia, água e internet");
    energy.put("barcode", "00190500954014481606906809350314337370000000100");
    postJson("/api/v1/finance/payables", energy);
    energy.put("barcode", "123");
    expectStatus("/api/v1/finance/payables", energy, 400);

    var all = getJson("/api/v1/finance/bills");
    assertEquals(16, all.size());
    var installments =
        getJson("/api/v1/finance/bills", "category", "Investimento");
    assertEquals(3, installments.size());
    assertEquals("Freezer (1/3)", installments.at("/0/description").asText());
    assertEquals(33.34, installments.at("/2/amount").asDouble());
    assertEquals(today.minusDays(1).plusDays(60).toString(), installments.at("/2/dueDate").asText());
    assertEquals("OVERDUE", installments.at("/0/status").asText());
    assertEquals(1, getJson("/api/v1/finance/bills", "status", "TODAY").size());
    assertEquals(1, getJson("/api/v1/finance/bills", "status", "OVERDUE").size());
    assertEquals(
        2,
        getJson(
                "/api/v1/finance/bills",
                "from", today.plusDays(1).toString(),
                "to", today.plusDays(40).toString(),
                "category", "Aluguel")
            .size());

    // Edição: valor não pode ficar abaixo do já pago.
    var todayBill = getJson("/api/v1/finance/bills", "status", "TODAY").get(0);
    var id = todayBill.path("id").asLong();
    postJson(
        "/api/v1/finance/payables/" + id + "/payments",
        Map.of(
            "requestId", UUID.randomUUID().toString(),
            "principal", 200,
            "accountId", accountId("BANK"),
            "method", "Boleto"));
    assertEquals("PAID", getJson("/api/v1/finance/bills", "status", "PAID").at("/0/status").asText());
    var edit = bill(supplierId, "Energia setembro", 150, today);
    edit.put("category", "Energia, água e internet");
    mvc.perform(
            put("/api/v1/finance/payables/" + id)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(edit)))
        .andExpect(status().isUnprocessableEntity());

    // Planejamento: saldo do banco -200; vencida 33,33 sai de cara; o aluguel em 5 dias sai no dia.
    var plan =
        getJson(
            "/api/v1/finance/bills/plan",
            "from", today.toString(),
            "to", today.plusDays(10).toString());
    assertEquals(-200.0, plan.path("balance").asDouble());
    assertEquals(33.33, plan.path("overdue").asDouble());
    assertEquals(today.plusDays(5).toString(), plan.at("/days/0/date").asText());
    assertEquals(-200 - 33.33 - 1500, plan.at("/days/0/projectedBalance").asDouble(), 0.001);
    // Alertas: vencida + aluguel em 5 dias (a de hoje já foi paga).
    assertEquals(2, plan.path("alerts").size());
  }
}
