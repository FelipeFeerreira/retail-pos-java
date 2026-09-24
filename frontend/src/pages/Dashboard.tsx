import { tr } from "../i18n";
import {
  Alert,
  Box,
  Button,
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
import {
  ArrowForwardRounded,
  PointOfSaleRounded,
  TrendingUpRounded,
  ReceiptLongRounded,
  ShoppingBasketRounded,
  Inventory2Rounded,
} from "@mui/icons-material";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppSelector, useData } from "../store";
import type { Page, Product, Report, Sale } from "../types";
import { money, qty, today } from "../utils";
import { Failure, Heading, Loading } from "../components/Common";
import { SalesChart } from "./Reports";
export default function Dashboard() {
  const { t } = useTranslation();
  const manager = useAppSelector((s) => s.auth?.role !== "CASHIER");
  const date = today();
  const report = useData<Report>(
    "/reports?from=" + date + "&to=" + date,
    !manager,
  );
  const sales = useData<Page<Sale>>("/sales");
  const alerts = useData<Product[]>("/alerts");
  // Contas e Boletos: vencidas, vence hoje e próximos 7 dias (só gerente/admin).
  const bills = useData<{ alerts: { status: string; balance: number }[] }>(
    "/finance/bills/plan?from=" + date + "&to=" + date + "&alertDays=7",
    !manager,
  );
  const billGroups = ["OVERDUE", "TODAY", "UPCOMING"].map((status) => {
    const list = (bills.data?.alerts || []).filter((b) => b.status === status);
    return {
      status,
      count: list.length,
      total: list.reduce((s, b) => s + Number(b.balance), 0),
    };
  });
  const stats = [
    [
      t("revenue"),
      money(report.data?.summary.revenue),
      TrendingUpRounded,
      "#087f5b",
    ],
    [
      t("transactions"),
      report.data?.summary.sales ?? "—",
      ReceiptLongRounded,
      "#487bb7",
    ],
    [
      t("average"),
      money(report.data?.summary.average),
      ShoppingBasketRounded,
      "#aa7b34",
    ],
    [
      tr("Produtos em alerta"),
      alerts.data?.length ?? "—",
      Inventory2Rounded,
      "#b5684a",
    ],
  ] as const;
  return (
    <>
      <Heading
        title={t("welcome")}
        subtitle={t("overview")}
        action={
          <Button
            component={Link}
            to="/sales"
            variant="contained"
            startIcon={<PointOfSaleRounded />}
          >
            {t("newSale")}
          </Button>
        }
      />
      {manager && billGroups.some((g) => g.count > 0) && (
        <Alert
          severity={
            billGroups[0].count
              ? "error"
              : billGroups[1].count
                ? "warning"
                : "info"
          }
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" component={Link} to="/bills">
              {tr("Ver contas")}
            </Button>
          }
        >
          <b>{tr("Contas e Boletos")}:</b>{" "}
          {billGroups
            .filter((g) => g.count > 0)
            .map(
              (g) =>
                `${g.count} ${
                  g.status === "OVERDUE"
                    ? tr("vencida(s)")
                    : g.status === "TODAY"
                      ? tr("vence(m) hoje")
                      : tr("nos próximos 7 dias")
                } (${money(g.total)})`,
            )
            .join(" • ")}
        </Alert>
      )}
      <Failure error={report.error || sales.error || alerts.error} />
      {manager && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" },
            gap: 2,
            mb: 3,
          }}
        >
          {stats.map(([label, value, Icon, color]) => (
            <Paper key={label} variant="outlined" sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography fontSize={12} color="text.secondary">
                  {label}
                </Typography>
                <Icon sx={{ color, fontSize: 21 }} />
              </Stack>
              <Typography fontSize={29} fontWeight={750} mt={1.5}>
                {value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("today")} • atualizado pelo servidor
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.6fr 1fr" },
          gap: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 3, minWidth: 0 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={3}
          >
            <Typography fontWeight={700}>{tr("Movimento do dia")}</Typography>
            <Chip label={t("today")} size="small" variant="outlined" />
          </Stack>
          {manager ? (
            report.isLoading ? (
              <Loading />
            ) : (
              <SalesChart data={report.data?.daily || []} />
            )
          ) : (
            <Stack justifyContent="center" alignItems="center" minHeight={230}>
              <PointOfSaleRounded
                sx={{ fontSize: 60, color: "primary.main" }}
              />
              <Typography mt={2}>{tr("Tudo pronto para atender.")}</Typography>
              <Button component={Link} to="/sales">
                {tr("Abrir frente de caixa")}
              </Button>
            </Stack>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" mb={2}>
            <Typography fontWeight={700}>{t("alerts")}</Typography>
            <Chip
              label={alerts.data?.length || 0}
              size="small"
              color="warning"
            />
          </Stack>
          <Stack gap={2}>
            {alerts.data?.slice(0, 5).map((p) => (
              <Stack key={p.id} direction="row" alignItems="center" gap={1.5}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: "action.hover",
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Inventory2Rounded fontSize="small" color="warning" />
                </Box>
                <Box flex={1}>
                  <Typography fontSize={13} fontWeight={600}>
                    {p.name}
                  </Typography>
                  <Typography fontSize={11} color="text.secondary">
                    {Number(p.quantity) <= Number(p.minimumStock)
                      ? tr("Estoque abaixo do mínimo")
                      : tr("Validade próxima")}
                    {p.expiresOn ? " • " + p.expiresOn : ""}
                  </Typography>
                </Box>
                <Typography fontSize={13} fontWeight={700}>
                  {qty(p.quantity)} {p.unit}
                </Typography>
              </Stack>
            ))}
          </Stack>
          {!alerts.data?.length && (
            <Typography color="text.secondary">
              Estoque em dia. Nenhum alerta.
            </Typography>
          )}
          <Button
            component={Link}
            to="/products"
            endIcon={<ArrowForwardRounded />}
            sx={{ mt: 2 }}
          >
            {tr("Ver estoque")}
          </Button>
        </Paper>
      </Box>
      <Paper variant="outlined" sx={{ mt: 3, overflow: "hidden" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          p={2.5}
        >
          <Typography fontWeight={700}>{t("recent")}</Typography>
          <Button component={Link} to="/sales">
            {tr("Ir para o caixa")}
          </Button>
        </Stack>
        <Box sx={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                {[
                  tr("Venda"),
                  tr("Horário"),
                  tr("Cliente"),
                  tr("Operador"),
                  tr("Status"),
                  tr("Total"),
                ].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sales.data?.content.slice(0, 6).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>#{String(s.id).padStart(5, "0")}</TableCell>
                  <TableCell>
                    {new Date(s.createdAt).toLocaleTimeString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    {s.customer?.name || tr("Consumidor final")}
                  </TableCell>
                  <TableCell>{s.user.username}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={s.status === "COMPLETED" ? "success" : "default"}
                      label={
                        s.status === "COMPLETED"
                          ? tr("Concluída")
                          : tr("Cancelada")
                      }
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>
                    {money(s.total)}
                  </TableCell>
                </TableRow>
              ))}
              {!sales.data?.content.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ py: 5, color: "text.secondary" }}
                  >
                    As vendas realizadas aparecem aqui. Que tal começar a
                    primeira?
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </>
  );
}
