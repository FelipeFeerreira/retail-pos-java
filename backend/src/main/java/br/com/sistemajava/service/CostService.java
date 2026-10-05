package br.com.sistemajava.service;

import br.com.sistemajava.domain.Product;
import br.com.sistemajava.repo.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import java.io.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.apache.commons.csv.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Custos pendentes: produtos sem custo deixam lucro, DRE e preço sugerido errados. Preenche por
 * planilha ou um a um. Vendas antigas sem custo (importadas do sistema anterior) recebem o custo
 * informado como estimativa, para as margens do período deixarem de aparecer como 100%.
 */
@Service
public class CostService {
  static final String[] HEADERS = {
    "id", "codigo", "codigo_barras", "produto", "unidade", "categoria", "preco_venda", "custo"
  };

  public record Pending(
      Long id,
      String code,
      String barcode,
      String name,
      String unit,
      BigDecimal price,
      String categoryName) {}

  private final ProductRepository products;
  private final CatalogService catalog;
  private final AuditService audit;
  private final Updates updates;
  private final JdbcTemplate jdbc;

  public CostService(
      ProductRepository products,
      CatalogService catalog,
      AuditService audit,
      Updates updates,
      JdbcTemplate jdbc) {
    this.products = products;
    this.catalog = catalog;
    this.audit = audit;
    this.updates = updates;
    this.jdbc = jdbc;
  }

  @Transactional(readOnly = true)
  public List<Pending> pending() {
    return products.findAll(Sort.by("name")).stream()
        .filter(p -> p.active && p.cost.signum() == 0)
        .map(
            p ->
                new Pending(
                    p.id,
                    p.code,
                    p.barcode,
                    p.name,
                    p.unit,
                    p.price,
                    p.category == null ? null : p.category.name))
        .toList();
  }

  @Transactional
  public Product setCost(Long id, BigDecimal cost) {
    var product = products.lock(id).orElseThrow(EntityNotFoundException::new);
    apply(product, cost, null);
    products.saveAndFlush(product);
    updates.publish("stock");
    return product;
  }

  private void apply(Product product, BigDecimal cost, BigDecimal price) {
    if (cost == null || cost.signum() <= 0 || cost.compareTo(new BigDecimal("9999999")) > 0)
      throw new BusinessException("Custo deve ser maior que zero: " + product.name);
    cost = cost.setScale(2, RoundingMode.HALF_UP);
    if (price != null) {
      if (price.signum() <= 0) throw new BusinessException("Preço inválido: " + product.name);
      catalog.changePrice(product, price.setScale(2, RoundingMode.HALF_UP));
    }
    var previous = product.cost;
    product.cost = cost;
    var sales =
        jdbc.update("UPDATE sale_items SET cost=? WHERE product_id=? AND cost=0", cost, product.id);
    audit.record(
        "COST",
        "products",
        product.id,
        product.name
            + ": "
            + previous
            + " → "
            + cost
            + (sales > 0 ? " (" + sales + " item(ns) de venda sem custo estimados)" : ""));
  }

  @Transactional(readOnly = true)
  public byte[] template(boolean onlyMissing) throws IOException {
    var list =
        products.findAll(Sort.by("name")).stream()
            .filter(p -> p.active && (!onlyMissing || p.cost.signum() == 0))
            .toList();
    try (var workbook = new XSSFWorkbook();
        var output = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Custos");
      var bold = workbook.createFont();
      bold.setBold(true);
      var headerStyle = workbook.createCellStyle();
      headerStyle.setFont(bold);
      var yellow = workbook.createCellStyle();
      yellow.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
      yellow.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      var yellowHeader = workbook.createCellStyle();
      yellowHeader.cloneStyleFrom(yellow);
      yellowHeader.setFont(bold);
      var header = sheet.createRow(0);
      for (int i = 0; i < HEADERS.length; i++) {
        var cell = header.createCell(i);
        cell.setCellValue(HEADERS[i]);
        cell.setCellStyle(i == HEADERS.length - 1 ? yellowHeader : headerStyle);
      }
      int index = 1;
      for (var p : list) {
        var row = sheet.createRow(index++);
        row.createCell(0).setCellValue(p.id);
        row.createCell(1).setCellValue(p.code);
        row.createCell(2).setCellValue(p.barcode == null ? "" : p.barcode);
        row.createCell(3).setCellValue(p.name);
        row.createCell(4).setCellValue(p.unit);
        row.createCell(5).setCellValue(p.category == null ? "" : p.category.name);
        row.createCell(6).setCellValue(p.price.doubleValue());
        var cost = row.createCell(7);
        if (p.cost.signum() > 0) cost.setCellValue(p.cost.doubleValue());
        cost.setCellStyle(yellow);
      }
      for (int i = 0; i < HEADERS.length; i++) sheet.autoSizeColumn(i);
      sheet.createFreezePane(0, 1);
      workbook.write(output);
      return output.toByteArray();
    }
  }

  public record ImportResult(int updated, int skipped) {}

  @Transactional
  public ImportResult importFile(MultipartFile file) throws IOException {
    var rows = read(file);
    int updated = 0, skipped = 0, line = 1;
    for (var row : rows) {
      line++;
      var costText = CatalogService.blank(row.get("custo"));
      if (costText == null) {
        skipped++;
        continue;
      }
      Product product;
      var id = CatalogService.blank(row.get("id"));
      var code = CatalogService.blank(row.get("codigo"));
      try {
        product =
            id != null
                ? products.lock(Long.valueOf(id.replaceAll("\\.0+$", ""))).orElse(null)
                : code == null
                    ? null
                    : products.findByCode(code).flatMap(p -> products.lock(p.id)).orElse(null);
      } catch (NumberFormatException ex) {
        product = null;
      }
      if (product == null)
        throw new BusinessException("Linha " + line + ": produto não encontrado. Nada foi salvo.");
      var cost = number(costText, line);
      var priceText = CatalogService.blank(row.get("preco_venda"));
      var price = priceText == null ? null : number(priceText, line);
      if (cost.compareTo(product.cost) == 0 && (price == null || price.compareTo(product.price) == 0))
        continue;
      try {
        apply(product, cost, price);
      } catch (BusinessException ex) {
        throw new BusinessException("Linha " + line + ": " + ex.getMessage() + ". Nada foi salvo.");
      }
      products.save(product);
      updated++;
    }
    updates.publish("stock");
    return new ImportResult(updated, skipped);
  }

  /** Aceita 4.5, 4,50, 1.234,56 e "R$ 4,50" (Excel em português grava vírgula). */
  static BigDecimal number(String text, int line) {
    var clean = text.replace("R$", "").replace(" ", "").trim();
    if (clean.contains(",")) clean = clean.replace(".", "").replace(",", ".");
    try {
      return new BigDecimal(clean);
    } catch (NumberFormatException ex) {
      throw new BusinessException("Linha " + line + ": número inválido \"" + text + "\". Nada foi salvo.");
    }
  }

  private List<Map<String, String>> read(MultipartFile file) throws IOException {
    var name = Objects.requireNonNullElse(file.getOriginalFilename(), "").toLowerCase(Locale.ROOT);
    var rows = new ArrayList<Map<String, String>>();
    if (name.endsWith(".xlsx")) {
      try (var workbook = new XSSFWorkbook(file.getInputStream())) {
        var sheet = workbook.getSheetAt(0);
        if (sheet.getLastRowNum() > 10000) throw new BusinessException("Máximo de 10000 linhas");
        var formatter = new DataFormatter(Locale.US);
        var header = sheet.getRow(0);
        if (header == null) throw new BusinessException("Cabeçalho ausente");
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
          var row = sheet.getRow(i);
          if (row == null) continue;
          var values = new HashMap<String, String>();
          for (int j = 0; j < header.getLastCellNum(); j++) {
            var cell = row.getCell(j);
            var value =
                cell != null && cell.getCellType() == CellType.NUMERIC
                    ? BigDecimal.valueOf(cell.getNumericCellValue()).toPlainString()
                    : formatter.formatCellValue(cell);
            values.put(key(formatter.formatCellValue(header.getCell(j))), value);
          }
          rows.add(values);
        }
      }
    } else if (name.endsWith(".csv")) {
      var text = new String(file.getBytes(), StandardCharsets.UTF_8).replace("﻿", "");
      var firstLine = text.lines().findFirst().orElse("");
      var delimiter = firstLine.contains(";") ? ';' : ',';
      try (var parser =
          CSVFormat.DEFAULT
              .builder()
              .setDelimiter(delimiter)
              .setHeader()
              .setSkipHeaderRecord(true)
              .get()
              .parse(new StringReader(text))) {
        for (var record : parser) {
          if (rows.size() >= 10000) throw new BusinessException("Máximo de 10000 linhas");
          var values = new HashMap<String, String>();
          record.toMap().forEach((k, v) -> values.put(key(k), v));
          rows.add(values);
        }
      }
    } else throw new BusinessException("Use a planilha .xlsx baixada aqui ou um CSV");
    if (!rows.isEmpty() && !rows.get(0).containsKey("custo"))
      throw new BusinessException("A planilha precisa da coluna \"custo\"");
    return rows;
  }

  private static String key(String header) {
    return header == null ? "" : header.trim().toLowerCase(Locale.ROOT);
  }
}
