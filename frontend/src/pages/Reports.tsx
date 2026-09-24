import { tr } from "../i18n";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { DownloadRounded } from "@mui/icons-material";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useData } from "../store";
import type { Report } from "../types";
import { money, today } from "../utils";
import { Failure, Heading, Loading, useNotice } from "../components/Common";
import { download } from "../services/download";
import Analytics from "./Analytics";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
export function SalesChart({ data }: { data: Report["daily"] }) {
  return (
    <Box sx={{ height: 240 }}>
      {data.length ? (
        <Bar
          data={{
            labels: data.map((d) =>
              d.day.slice(5).split("-").reverse().join("/"),
            ),
            datasets: [
              {
                label: "Vendas (R$)",
                data: data.map((d) => Number(d.total)),
                backgroundColor: "#15996d",
                borderRadius: 6,
                maxBarThickness: 46,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: {
                beginAtZero: true,
                grid: { color: "rgba(120,140,130,.12)" },
              },
            },
          }}
        />
      ) : (
        <Stack
          sx={{
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography color="text.secondary">
            {tr("Nenhuma venda neste período.")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tr("O gráfico aparece após o primeiro atendimento.")}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
export default function Reports() {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const notice = useNotice();
  const path = "/reports?from=" + from + "&to=" + to;
  const { data, error, isLoading } = useData<Report>(path, !from || !to);
  const exportFile = async (format: string) => {
    try {
      await download(
        "/reports/export?from=" + from + "&to=" + to + "&format=" + format,
        "relatorio." + format,
      );
    } catch {
      notice("Falha ao exportar relatório", "error");
    }
  };
  return (
    <>
      <Heading
        title={tr("Relatórios")}
        subtitle={tr("Dados para cuidar do seu negócio com confiança.")}
        action={
          <Stack direction="row" gap={1}>
            <Button
              variant="outlined"
              startIcon={<DownloadRounded />}
              onClick={() => exportFile("pdf")}
            >
              PDF
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadRounded />}
              onClick={() => exportFile("xlsx")}
            >
              {tr("Excel")}
            </Button>
          </Stack>
        }
      />
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" gap={2} flexWrap="wrap">
          <TextField
            label={tr("De")}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={tr("Até")}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            onClick={() => {
              setFrom(today());
              setTo(today());
            }}
          >
            {tr("Hoje")}
          </Button>
          <Button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 6);
              setFrom(
                new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 10),
              );
              setTo(today());
            }}
          >
            {tr("7 dias")}
          </Button>
          <Button
            onClick={() => {
              setFrom(today().slice(0, 7) + "-01");
              setTo(today());
            }}
          >
            {tr("Este mês")}
          </Button>
        </Stack>
      </Paper>
      <Failure error={error} />
      {isLoading ? (
        <Loading />
      ) : (
        data && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" },
                gap: 2,
                mb: 3,
              }}
            >
              {[
                [tr("Faturamento"), money(data.summary.revenue)],
                [tr("Vendas"), data.summary.sales],
                [tr("Ticket médio"), money(data.summary.average)],
                [tr("Taxas de pagamento"), money(data.summary.fees)],
              ].map(([label, value]) => (
                <Paper key={label} variant="outlined" sx={{ p: 2.5 }}>
                  <Typography color="text.secondary" fontSize={13}>
                    {label}
                  </Typography>
                  <Typography variant="h5" fontWeight={750} mt={1}>
                    {value}
                  </Typography>
                </Paper>
              ))}
            </Box>
            {!!data.writeoffs?.length && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <b>{tr("Custos que não aparecem na venda")}:</b>{" "}
                {data.writeoffs
                  .map(
                    (w) =>
                      (w.kind === "LOSS"
                        ? tr("perdas")
                        : tr("consumo interno")) +
                      " " +
                      money(w.total),
                  )
                  .join(" • ")}
                . {tr("Eles reduzem o lucro real do período.")}
              </Alert>
            )}
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Typography fontWeight={700} mb={3}>
                {tr("Vendas por dia")}
              </Typography>
              <SalesChart data={data.daily} />
            </Paper>
            <ReportTable
              title={tr("Mais vendidos")}
              headers={[
                tr("Produto"),
                tr("Quantidade"),
                tr("Receita"),
                tr("Margem bruta"),
              ]}
              rows={data.bestSellers.map((p) => [
                p.name,
                p.quantity,
                money(p.total),
                money(p.gross_margin),
              ])}
            />
            <ReportTable
              title={tr("Meios de pagamento")}
              headers={[tr("Forma"), tr("Total"), tr("Taxas")]}
              rows={data.payments.map((p) => [
                p.method,
                money(p.total),
                money(p.fees),
              ])}
            />
            <ReportTable
              title={tr("Giro e validade do estoque")}
              headers={[
                tr("Produto"),
                tr("Unidade"),
                tr("Em estoque"),
                tr("Vendido"),
                tr("Giro"),
                tr("Validade"),
              ]}
              rows={data.stock.map((p) => [
                p.name,
                p.unit,
                p.quantity,
                p.sold,
                p.turnover,
                p.expires_on || "—",
              ])}
            />
            <Alert severity="info" sx={{ my: 2 }}>
              Giro = quantidade vendida / estoque médio estimado entre o início
              do período e agora. Produtos sem validade cadastrada aparecem com
              “—”.
            </Alert>
            <ReportTable
              title={tr("Fiado em atraso")}
              headers={[tr("Cliente"), tr("Saldo vencido"), tr("Vencimento")]}
              rows={data.overdue.map((c) => [
                c.name,
                money(c.balance),
                c.due_date,
              ])}
            />
            <Analytics from={from} to={to} />
          </>
        )
      )}
    </>
  );
}
function ReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <Paper variant="outlined" sx={{ mb: 3, overflow: "hidden" }}>
      <Typography fontWeight={700} p={2.5}>
        {title}
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((v, i) => (
                  <TableCell key={i}>{v}</TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={headers.length} align="center">
                  {tr("Nenhum registro no período.")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
