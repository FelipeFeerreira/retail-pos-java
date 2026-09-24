package br.com.sistemajava.service;

import java.io.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Customer-facing price list grouped by category, with the promotions valid today. */
@Service
public class CatalogExportService {
  private final JdbcTemplate jdbc;

  public CatalogExportService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional(readOnly = true)
  public byte[] catalog() throws IOException {
    var store =
        jdbc.queryForList("SELECT value FROM settings WHERE id='store.name'", String.class).stream()
            .findFirst()
            .orElse("Meu Mercadinho");
    var rows =
        jdbc.queryForList(
            "SELECT coalesce(c.name,'Outros') AS category,p.name,p.code,p.unit,p.price,(SELECT"
                + " min(r.price) FROM price_rules r WHERE r.product_id=p.id AND"
                + " r.table_name='RETAIL' AND r.starts_at<=? AND r.ends_at>?) AS promo FROM"
                + " products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=true"
                + " AND p.quantity>0 ORDER BY coalesce(c.name,'Outros'),p.name",
            Timestamp.from(Instant.now()),
            Timestamp.from(Instant.now()));
    try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Catálogo");
      var titleFont = workbook.createFont();
      titleFont.setBold(true);
      titleFont.setFontHeightInPoints((short) 16);
      var title = workbook.createCellStyle();
      title.setFont(titleFont);
      var boldFont = workbook.createFont();
      boldFont.setBold(true);
      boldFont.setColor(IndexedColors.WHITE.getIndex());
      var section = workbook.createCellStyle();
      section.setFont(boldFont);
      section.setFillForegroundColor(IndexedColors.SEA_GREEN.getIndex());
      section.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      var money = workbook.createCellStyle();
      money.setDataFormat(workbook.createDataFormat().getFormat("\"R$\" #,##0.00"));
      var promoFont = workbook.createFont();
      promoFont.setBold(true);
      promoFont.setColor(IndexedColors.RED.getIndex());
      var promo = workbook.createCellStyle();
      promo.cloneStyleFrom(money);
      promo.setFont(promoFont);
      int index = 0;
      var head = sheet.createRow(index++).createCell(0);
      head.setCellValue(store + " • Tabela de preços");
      head.setCellStyle(title);
      sheet
          .createRow(index++)
          .createCell(0)
          .setCellValue(
              "Atualizada em "
                  + java.time.LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo"))
                      .format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                  + ". Preços sujeitos a alteração.");
      index++;
      String current = null;
      for (var row : rows) {
        var category = (String) row.get("category");
        if (!category.equals(current)) {
          current = category;
          if (index > 3) index++;
          var r = sheet.createRow(index);
          for (int i = 0; i < 4; i++) r.createCell(i).setCellStyle(section);
          r.getCell(0).setCellValue(category.toUpperCase());
          sheet.addMergedRegion(new CellRangeAddress(index, index, 0, 3));
          index++;
        }
        var r = sheet.createRow(index++);
        r.createCell(0).setCellValue((String) row.get("name"));
        r.createCell(1).setCellValue("UN".equals(row.get("unit")) ? "unidade" : "kg");
        var price = r.createCell(2);
        price.setCellValue(((BigDecimal) row.get("price")).doubleValue());
        price.setCellStyle(money);
        if (row.get("promo") != null
            && ((BigDecimal) row.get("promo")).compareTo((BigDecimal) row.get("price")) < 0) {
          var offer = r.createCell(3);
          offer.setCellValue(((BigDecimal) row.get("promo")).doubleValue());
          offer.setCellStyle(promo);
        }
      }
      sheet.setColumnWidth(0, 48 * 256);
      sheet.setColumnWidth(1, 10 * 256);
      sheet.setColumnWidth(2, 14 * 256);
      sheet.setColumnWidth(3, 14 * 256);
      workbook.write(output);
      return output.toByteArray();
    }
  }
}
