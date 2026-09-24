package br.com.sistemajava.api;

import br.com.sistemajava.service.ReportService;
import com.lowagie.text.Document;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.*;
import java.io.*;
import java.time.*;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class ReportController {
  private final ReportService reports;

  public ReportController(ReportService reports) {
    this.reports = reports;
  }

  @GetMapping
  public Map<String, Object> report(@RequestParam LocalDate from, @RequestParam LocalDate to) {
    return reports.report(from, to);
  }

  @GetMapping("/export")
  @SuppressWarnings("unchecked")
  public ResponseEntity<byte[]> export(
      @RequestParam LocalDate from,
      @RequestParam LocalDate to,
      @RequestParam(defaultValue = "xlsx") String format)
      throws IOException {
    var data = reports.report(from, to);
    var output = new ByteArrayOutputStream();
    if ("pdf".equals(format)) {
      var document = new Document(PageSize.A4.rotate());
      PdfWriter.getInstance(document, output);
      document.open();
      document.add(new Paragraph("Mercadinho - Relatório " + from + " a " + to));
      document.add(new Paragraph(data.get("summary").toString()));
      for (var entry : data.entrySet())
        if (entry.getValue() instanceof java.util.List<?> rows && !rows.isEmpty()) {
          document.add(new Paragraph(" "));
          document.add(new Paragraph(entry.getKey()));
          var first = (Map<String, Object>) rows.get(0);
          var table = new PdfPTable(first.size());
          table.setWidthPercentage(100);
          first.keySet().forEach(k -> table.addCell(k));
          for (var row : rows)
            ((Map<String, Object>) row)
                .values()
                .forEach(v -> table.addCell(v == null ? "" : v.toString()));
          document.add(table);
        }
      document.close();
    } else if ("xlsx".equals(format)) {
      try (var workbook = new XSSFWorkbook()) {
        for (var entry : data.entrySet()) {
          var sheet = workbook.createSheet(entry.getKey());
          var rows =
              entry.getValue() instanceof Map<?, ?>
                  ? List.of((Map<String, Object>) entry.getValue())
                  : (List<Map<String, Object>>) entry.getValue();
          if (rows.isEmpty()) continue;
          var header = sheet.createRow(0);
          int column = 0;
          for (var key : rows.get(0).keySet()) header.createCell(column++).setCellValue(key);
          int index = 1;
          for (var row : rows) {
            var excel = sheet.createRow(index++);
            column = 0;
            for (var value : row.values()) {
              var cell = excel.createCell(column++);
              if (value instanceof Number n) cell.setCellValue(n.doubleValue());
              else cell.setCellValue(value == null ? "" : value.toString());
            }
          }
          for (int i = 0; i < header.getLastCellNum(); i++) sheet.autoSizeColumn(i);
          sheet.createFreezePane(0, 1);
        }
        workbook.write(output);
      }
    } else throw new IllegalArgumentException("format");
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=relatorio." + format)
        .contentType(
            MediaType.parseMediaType(
                format.equals("pdf")
                    ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(output.toByteArray());
  }
}
