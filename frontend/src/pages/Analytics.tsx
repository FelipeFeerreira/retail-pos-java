import { tr } from "../i18n";
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Bar } from "react-chartjs-2";
import { useData } from "../store";
import { money, qty } from "../utils";
import { Failure, Loading } from "../components/Common";

interface Bucket {
  name: string;
  sales: number;
  total: number;
  average: number;
  days: number;
  perDay: number;
}
interface AnalyticsData {
  byWeekday: Bucket[];
  byDayType: Bucket[];
  byHour: { hour: number; sales: number; total: number }[];
  byCategory: {
    category: string;
    quantity: number;
    total: number;
    margin: number;
    sales: number;
  }[];
  topCustomers: {
    id: number;
    name: string;
    purchases: number;
    total: number;
    lastPurchase: string;
  }[];
  abc: {
    id: number;
    name: string;
    quantity: number;
    total: number;
    share: number;
    class: "A" | "B" | "C";
  }[];
  upcoming: { date: string; type: string; name: string }[];
}

function BucketTable({ title, rows }: { title: string; rows: Bucket[] }) {
  const best = Math.max(...rows.map((r) => Number(r.perDay)));
  return (
    <Paper variant="outlined" sx={{ overflowX: "auto" }}>
      <Typography fontWeight={700} p={2} pb={1}>
        {title}
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell align="right">{tr("Vendas")}</TableCell>
            <TableCell align="right">{tr("Faturamento")}</TableCell>
            <TableCell align="right">{tr("Ticket médio")}</TableCell>
            <TableCell align="right">{tr("Média por dia")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell sx={{ fontWeight: 650 }}>
                {tr(r.name)}
                {best > 0 && Number(r.perDay) === best && (
                  <Chip
                    size="small"
                    color="success"
                    label={tr("melhor")}
                    sx={{ ml: 1 }}
                  />
                )}
              </TableCell>
              <TableCell align="right">{r.sales}</TableCell>
              <TableCell align="right">{money(r.total)}</TableCell>
              <TableCell align="right">{money(r.average)}</TableCell>
              <TableCell align="right">
                {money(r.perDay)}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  {r.days} {tr("dia(s)")}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

/** When and what sells: weekday, hour, day type, categories, ABC curve and best customers. */
export default function Analytics({ from, to }: { from: string; to: string }) {
  const { data, error, isLoading } = useData<AnalyticsData>(
    `/reports/analytics?from=${from}&to=${to}`,
    !from || !to,
  );
  if (isLoading) return <Loading />;
  if (!data) return <Failure error={error} />;
  const counts = { A: 0, B: 0, C: 0 };
  data.abc.forEach((p) => counts[p.class]++);
  return (
    <>
      <Typography variant="h5" fontWeight={750} mt={5} mb={2}>
        {tr("Análises do período")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(2,1fr)" },
          gap: 2,
          mb: 2,
        }}
      >
        <BucketTable title={tr("Por dia da semana")} rows={data.byWeekday} />
        <BucketTable title={tr("Por tipo de dia")} rows={data.byDayType} />
      </Box>
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
        <Typography fontWeight={700} mb={2}>
          {tr("Vendas por horário")}
        </Typography>
        <Box sx={{ height: 200 }}>
          <Bar
            data={{
              labels: data.byHour.map((h) => h.hour + "h"),
              datasets: [
                {
                  label: tr("Vendas"),
                  data: data.byHour.map((h) => h.sales),
                  backgroundColor: "#cc8438",
                  borderRadius: 4,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { precision: 0 } },
              },
            }}
          />
        </Box>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(2,1fr)" },
          gap: 2,
          mb: 2,
          alignItems: "start",
        }}
      >
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Typography fontWeight={700} p={2} pb={1}>
            {tr("Por categoria")}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tr("Categoria")}</TableCell>
                <TableCell align="right">{tr("Receita")}</TableCell>
                <TableCell align="right">{tr("Margem bruta")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.byCategory.map((c) => (
                <TableRow key={c.category}>
                  <TableCell>{c.category}</TableCell>
                  <TableCell align="right">{money(c.total)}</TableCell>
                  <TableCell align="right">
                    {money(c.margin)}
                    {Number(c.total) > 0 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {((Number(c.margin) / Number(c.total)) * 100).toFixed(
                          1,
                        )}
                        %
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Typography fontWeight={700} p={2} pb={1}>
            {tr("Melhores clientes")}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tr("Cliente")}</TableCell>
                <TableCell align="right">{tr("Compras")}</TableCell>
                <TableCell align="right">{tr("Total")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.topCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell align="right">{c.purchases}</TableCell>
                  <TableCell align="right">{money(c.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.topCustomers.length && (
            <Typography color="text.secondary" fontSize={13} p={2}>
              {tr("Nenhuma venda com cliente identificado no período.")}
            </Typography>
          )}
        </Paper>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0,2fr) minmax(0,1fr)" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Stack direction="row" alignItems="center" p={2} pb={1} gap={1}>
            <Typography fontWeight={700} flex={1}>
              {tr("Curva ABC")}
            </Typography>
            <Chip size="small" color="success" label={`A: ${counts.A}`} />
            <Chip size="small" color="warning" label={`B: ${counts.B}`} />
            <Chip size="small" label={`C: ${counts.C}`} />
          </Stack>
          <Typography fontSize={12} color="text.secondary" px={2} pb={1}>
            {tr(
              "A = produtos que fazem cerca de 80% da receita: nunca deixe faltar. C = pouca receita: compre menos.",
            )}
          </Typography>
          <Box sx={{ maxHeight: 360, overflowY: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Classe")}</TableCell>
                  <TableCell>{tr("Produto")}</TableCell>
                  <TableCell align="right">{tr("Quantidade")}</TableCell>
                  <TableCell align="right">{tr("Receita")}</TableCell>
                  <TableCell align="right">%</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.abc.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={p.class}
                        color={
                          p.class === "A"
                            ? "success"
                            : p.class === "B"
                              ? "warning"
                              : "default"
                        }
                      />
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="right">{qty(p.quantity)}</TableCell>
                    <TableCell align="right">{money(p.total)}</TableCell>
                    <TableCell align="right">
                      {Number(p.share).toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography fontWeight={700} mb={0.5}>
            {tr("Próximos 45 dias")}
          </Typography>
          <Typography fontSize={12} color="text.secondary" mb={1.5}>
            {tr("Feriados e dias de pagamento, para programar as compras.")}
          </Typography>
          {data.upcoming.map((e) => (
            <Stack
              key={e.date}
              direction="row"
              gap={1}
              py={0.5}
              alignItems="center"
            >
              <Typography fontSize={13} sx={{ width: 90 }}>
                {e.date.split("-").reverse().join("/")}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={e.type === "Feriado" ? "error" : "success"}
                label={tr(e.name)}
              />
            </Stack>
          ))}
        </Paper>
      </Box>
    </>
  );
}
