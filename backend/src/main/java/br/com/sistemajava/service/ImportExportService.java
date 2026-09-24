package br.com.sistemajava.service;

import br.com.sistemajava.api.Dtos;
import br.com.sistemajava.repo.ProductRepository;
import jakarta.validation.Validator;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import org.apache.commons.csv.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImportExportService {
  private final ProductRepository products;
  private final CatalogService catalog;
  private final Validator validator;
  static final String[] HEADERS = {
    "code", "barcode", "name", "categoryId", "unit", "price", "cost", "minimumStock", "expiresOn"
  };

  public ImportExportService(
      ProductRepository products, CatalogService catalog, Validator validator) {
    this.products = products;
    this.catalog = catalog;
    this.validator = validator;
  }

  @Transactional
  public int importFile(MultipartFile file) throws IOException {
    var name = Objects.requireNonNullElse(file.getOriginalFilename(), "").toLowerCase(Locale.ROOT);
    var rows = new ArrayList<Map<String, String>>();
    if (name.endsWith(".csv")) {
      try (var reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8);
          var parser =
              CSVFormat.DEFAULT
                  .builder()
                  .setHeader()
                  .setSkipHeaderRecord(true)
                  .get()
                  .parse(reader)) {
        for (var record : parser) {
          if (rows.size() >= 5000) throw new BusinessException("Máximo de 5000 linhas");
          rows.add(record.toMap());
        }
      }
    } else if (name.endsWith(".xlsx")) {
      try (var workbook = new XSSFWorkbook(file.getInputStream())) {
        var sheet = workbook.getSheetAt(0);
        var formatter = new DataFormatter(Locale.US);
        if (sheet.getLastRowNum() > 5000) throw new BusinessException("Máximo de 5000 linhas");
        var header = sheet.getRow(0);
        if (header == null) throw new BusinessException("Cabeçalho ausente");
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
          var row = sheet.getRow(i);
          if (row == null) continue;
          var values = new LinkedHashMap<String, String>();
          for (int j = 0; j < header.getLastCellNum(); j++)
            values.put(
                formatter.formatCellValue(header.getCell(j)),
                formatter.formatCellValue(row.getCell(j)));
          rows.add(values);
        }
      }
    } else throw new BusinessException("Use CSV UTF-8 ou XLSX");
    int index = 1;
    for (var row : rows) {
      index++;
      try {
        var category = CatalogService.blank(row.get("categoryId"));
        var expiry = CatalogService.blank(row.get("expiresOn"));
        var input =
            new Dtos.ProductInput(
                row.get("code"),
                row.get("barcode"),
                row.get("name"),
                category == null ? null : Long.valueOf(category),
                row.get("unit"),
                decimal(row, "price"),
                decimal(row, "cost"),
                decimal(row, "minimumStock"),
                expiry == null ? null : LocalDate.parse(expiry),
                null);
        var errors = validator.validate(input);
        if (!errors.isEmpty())
          throw new BusinessException(
              errors.iterator().next().getPropertyPath()
                  + ": "
                  + errors.iterator().next().getMessage());
        var existing = products.findByCode(input.code());
        catalog.save(existing.map(p -> p.id).orElse(null), input);
      } catch (RuntimeException ex) {
        throw new BusinessException(
            "Linha "
                + index
                + ": dados inválidos ("
                + ex.getClass().getSimpleName()
                + "). Nenhuma linha foi importada.");
      }
    }
    return rows.size();
  }

  private BigDecimal decimal(Map<String, String> row, String key) {
    return new BigDecimal(row.getOrDefault(key, "0"));
  }

  @Transactional(readOnly = true)
  public byte[] export(String format) throws IOException {
    var list = products.findAll();
    var output = new ByteArrayOutputStream();
    if ("csv".equals(format)) {
      try (var printer =
          new CSVPrinter(
              new OutputStreamWriter(output, StandardCharsets.UTF_8),
              CSVFormat.DEFAULT.builder().setHeader(HEADERS).get())) {
        for (var p : list)
          printer.printRecord(
              safe(p.code),
              safe(p.barcode),
              safe(p.name),
              p.category == null ? "" : p.category.id,
              p.unit,
              p.price,
              p.cost,
              p.minimumStock,
              p.expiresOn);
      }
    } else if ("xlsx".equals(format)) {
      try (var workbook = new XSSFWorkbook()) {
        var sheet = workbook.createSheet("Produtos");
        var header = sheet.createRow(0);
        for (int i = 0; i < HEADERS.length; i++) header.createCell(i).setCellValue(HEADERS[i]);
        int index = 1;
        for (var p : list) {
          var row = sheet.createRow(index++);
          Object[] values = {
            p.code,
            p.barcode,
            p.name,
            p.category == null ? null : p.category.id,
            p.unit,
            p.price,
            p.cost,
            p.minimumStock,
            p.expiresOn
          };
          for (int i = 0; i < values.length; i++)
            row.createCell(i).setCellValue(values[i] == null ? "" : values[i].toString());
        }
        for (int i = 0; i < HEADERS.length; i++) sheet.autoSizeColumn(i);
        workbook.write(output);
      }
    } else throw new BusinessException("Use csv ou xlsx");
    return output.toByteArray();
  }

  private String safe(String value) {
    return value != null && value.matches("^[=+@\\-\\t\\r].*") ? "'" + value : value;
  }
}
