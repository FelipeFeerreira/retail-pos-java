import { tr } from "../i18n";
import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import {
  LockOpenRounded,
  LockRounded,
  NorthEastRounded,
  SouthWestRounded,
  PrintRounded,
} from "@mui/icons-material";
import { useReactToPrint } from "react-to-print";
import { useTranslation } from "react-i18next";
import { useAppSelector, useData, useSendMutation } from "../store";
import type { CashSession, CashSummary, Page } from "../types";
import { errorMessage, money } from "../utils";
import {
  Failure,
  FormDialog,
  Heading,
  Loading,
  useNotice,
} from "../components/Common";

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

export default function Cash() {
  const { t } = useTranslation();
  const current = useData<CashSummary | null>("/cash/current");
  const manager = useAppSelector((s) => s.auth?.role !== "CASHIER");
  const [page, setPage] = useState(0);
  const history = useData<Page<CashSession>>("/cash/sessions?page=" + page);
  const [viewing, setViewing] = useState<number | null>(null);
  const [report, setReport] = useState<CashSummary | null>(null);
  return (
    <>
      <Heading
        title={t("cashDrawer")}
        subtitle={tr(
          "Abertura, sangria, suprimento e fechamento do seu turno.",
        )}
      />
      <Failure error={current.error} />
      {current.isLoading ? (
        <Loading />
      ) : current.data ? (
        <OpenDrawer summary={current.data} onClosed={setReport} />
      ) : (
        <OpenForm />
      )}
      <Typography fontWeight={700} mt={4} mb={1.5}>
        {manager ? tr("Histórico de caixas") : tr("Meus caixas")}
      </Typography>
      <Failure error={history.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>{tr("Operador")}</TableCell>
              <TableCell>{tr("Abertura")}</TableCell>
              <TableCell>{tr("Fechamento")}</TableCell>
              <TableCell align="right">{tr("Esperado")}</TableCell>
              <TableCell align="right">{tr("Contado")}</TableCell>
              <TableCell align="right">{tr("Diferença")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {history.data?.content.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell>{s.id}</TableCell>
                <TableCell>{s.user.username}</TableCell>
                <TableCell>{dateTime(s.openedAt)}</TableCell>
                <TableCell>
                  {s.status === "OPEN" ? (
                    <Chip size="small" color="success" label={tr("Aberto")} />
                  ) : (
                    dateTime(s.closedAt)
                  )}
                </TableCell>
                <TableCell align="right">
                  {s.expectedCash === null ? "—" : money(s.expectedCash)}
                </TableCell>
                <TableCell align="right">
                  {s.countedCash === null ? "—" : money(s.countedCash)}
                </TableCell>
                <TableCell align="right">
                  {s.difference === null ? (
                    "—"
                  ) : (
                    <Difference value={s.difference} />
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setViewing(s.id)}>
                    {tr("Detalhes")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {history.isLoading && <Loading />}
        {!history.data?.content.length && !history.isLoading && (
          <Alert severity="info">{tr("Nenhum caixa registrado ainda.")}</Alert>
        )}
      </Paper>
      {(history.data?.totalPages ?? 0) > 1 && (
        <Stack direction="row" gap={1} mt={1.5} justifyContent="flex-end">
          <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
            {tr("Anterior")}
          </Button>
          <Button
            disabled={page + 1 >= (history.data?.totalPages ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            {tr("Próxima")}
          </Button>
        </Stack>
      )}
      {report && (
        <ReportDialog summary={report} onClose={() => setReport(null)} />
      )}
      {viewing !== null && (
        <ReportDialog id={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}

function Difference({ value }: { value: number }) {
  const n = Number(value);
  return (
    <Chip
      size="small"
      variant="outlined"
      color={n === 0 ? "success" : n > 0 ? "info" : "error"}
      label={(n > 0 ? "+" : "") + money(n)}
    />
  );
}

function OpenForm() {
  const [amount, setAmount] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
      <Stack direction="row" gap={1} alignItems="center" mb={1}>
        <LockRounded color="warning" />
        <Typography fontWeight={750}>{tr("Caixa fechado")}</Typography>
      </Stack>
      <Typography color="text.secondary" fontSize={14} mb={2.5}>
        {tr(
          "Conte o dinheiro de troco na gaveta e informe o valor para começar a vender.",
        )}
      </Typography>
      <Stack
        component="form"
        direction="row"
        gap={1.5}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await send({
              url: "/cash/open",
              method: "POST",
              body: { openingAmount: Number(amount || 0) },
            }).unwrap();
            notice(tr("Caixa aberto. Boas vendas!"));
          } catch (e) {
            notice(errorMessage(e), "error");
          }
        }}
      >
        <TextField
          label={tr("Fundo de troco R$")}
          type="number"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ flex: 1 }}
        />
        <Button
          type="submit"
          variant="contained"
          startIcon={<LockOpenRounded />}
          disabled={isLoading}
        >
          {tr("Abrir caixa")}
        </Button>
      </Stack>
    </Paper>
  );
}

function OpenDrawer({
  summary,
  onClosed,
}: {
  summary: CashSummary;
  onClosed: (report: CashSummary) => void;
}) {
  const [send] = useSendMutation();
  const notice = useNotice();
  const [movement, setMovement] = useState<"WITHDRAWAL" | "SUPPLY" | null>(
    null,
  );
  const [closing, setClosing] = useState(false);
  const base = "/cash/sessions/" + summary.session.id;
  return (
    <>
      <Stack direction="row" gap={1} alignItems="center" mb={2} flexWrap="wrap">
        <Chip
          color="success"
          icon={<LockOpenRounded />}
          label={tr("Caixa aberto")}
        />
        <Typography color="text.secondary" fontSize={13} flex={1}>
          #{summary.session.id} • {summary.session.user.username} •{" "}
          {tr("desde")} {dateTime(summary.session.openedAt)}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SouthWestRounded />}
          onClick={() => setMovement("SUPPLY")}
        >
          {tr("Suprimento")}
        </Button>
        <Button
          variant="outlined"
          startIcon={<NorthEastRounded />}
          onClick={() => setMovement("WITHDRAWAL")}
        >
          {tr("Sangria")}
        </Button>
        <Button
          variant="contained"
          color="warning"
          startIcon={<LockRounded />}
          onClick={() => setClosing(true)}
        >
          {tr("Fechar caixa")}
        </Button>
      </Stack>
      <SummaryView summary={summary} />
      {movement && (
        <FormDialog
          title={
            movement === "SUPPLY"
              ? tr("Suprimento (entrada de troco)")
              : tr("Sangria (retirada)")
          }
          fields={[
            {
              key: "amount",
              label: tr("Valor R$"),
              type: "number",
              required: true,
              min: 0.01,
              step: 0.01,
            },
            {
              key: "reason",
              label: tr("Motivo"),
              required: true,
              helper:
                movement === "SUPPLY"
                  ? tr("Ex.: troco adicional do cofre")
                  : tr("Ex.: depósito no cofre, pagamento de fornecedor"),
            },
          ]}
          onClose={() => setMovement(null)}
          onSave={async (v) => {
            try {
              await send({
                url: base + "/movements",
                method: "POST",
                body: {
                  type: movement,
                  amount: Number(v.amount),
                  reason: v.reason,
                },
              }).unwrap();
              notice(tr("Movimento registrado"));
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      )}
      {closing && (
        <CloseDialog
          summary={summary}
          onClose={() => setClosing(false)}
          onClosed={onClosed}
        />
      )}
    </>
  );
}

function SummaryView({ summary }: { summary: CashSummary }) {
  const { t } = useTranslation();
  const tiles = [
    [tr("Fundo de troco"), summary.session.openingAmount],
    [tr("Vendas em dinheiro"), summary.cashSales],
    [tr("Fiado recebido em dinheiro"), summary.creditReceipts],
    [tr("Suprimentos"), summary.supplies],
    [tr("Sangrias"), -Number(summary.withdrawals)],
  ] as const;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.2fr) minmax(0,1fr)" },
        gap: 2,
      }}
    >
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={1.5}>
          {tr("Dinheiro na gaveta")}
        </Typography>
        {tiles.map(([label, value]) => (
          <Stack
            key={label}
            direction="row"
            justifyContent="space-between"
            py={0.6}
          >
            <Typography color="text.secondary" fontSize={14}>
              {label}
            </Typography>
            <Typography fontSize={14}>{money(value)}</Typography>
          </Stack>
        ))}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mt={1.5}
          pt={1.5}
          sx={{ borderTop: 1, borderColor: "divider" }}
        >
          <Typography fontWeight={700}>{tr("Dinheiro esperado")}</Typography>
          <Typography variant="h5" color="primary" fontWeight={800}>
            {money(summary.expectedCash)}
          </Typography>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={1.5}>
          {tr("Vendas do turno")}
        </Typography>
        <Stack direction="row" justifyContent="space-between" py={0.6}>
          <Typography color="text.secondary" fontSize={14}>
            {summary.sales} {summary.sales === 1 ? tr("venda") : tr("vendas")}
            {summary.cancelled > 0 &&
              ` • ${summary.cancelled} ${tr("canceladas")}`}
          </Typography>
          <Typography fontWeight={700}>{money(summary.salesTotal)}</Typography>
        </Stack>
        {summary.payments.map((p) => (
          <Stack
            key={p.method}
            direction="row"
            justifyContent="space-between"
            py={0.6}
          >
            <Typography color="text.secondary" fontSize={14}>
              {t(p.method.toLowerCase())}
            </Typography>
            <Typography fontSize={14}>{money(p.total)}</Typography>
          </Stack>
        ))}
        {!summary.payments.length && (
          <Typography color="text.secondary" fontSize={13}>
            {tr("Nenhuma venda neste caixa ainda.")}
          </Typography>
        )}
      </Paper>
      {summary.movements.length > 0 && (
        <Paper
          variant="outlined"
          sx={{ gridColumn: "1 / -1", overflowX: "auto" }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tr("Horário")}</TableCell>
                <TableCell>{tr("Tipo")}</TableCell>
                <TableCell>{tr("Motivo")}</TableCell>
                <TableCell>{tr("Operador")}</TableCell>
                <TableCell align="right">{tr("Valor")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{dateTime(m.createdAt)}</TableCell>
                  <TableCell>
                    {m.type === "SUPPLY" ? tr("Suprimento") : tr("Sangria")}
                  </TableCell>
                  <TableCell>{m.reason}</TableCell>
                  <TableCell>{m.user.username}</TableCell>
                  <TableCell align="right">
                    {money(m.type === "SUPPLY" ? m.amount : -Number(m.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}

function CloseDialog({
  summary,
  onClose,
  onClosed,
}: {
  summary: CashSummary;
  onClose: () => void;
  onClosed: (report: CashSummary) => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const difference =
    counted === ""
      ? null
      : Math.round((Number(counted) - Number(summary.expectedCash)) * 100) /
        100;
  return (
    <Dialog
      open
      onClose={isLoading ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const result = (await send({
              url: "/cash/sessions/" + summary.session.id + "/close",
              method: "POST",
              body: { countedCash: Number(counted), notes },
            }).unwrap()) as CashSummary;
            notice(tr("Caixa fechado"));
            onClosed(result);
            onClose();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        <DialogTitle>{tr("Fechar caixa")}</DialogTitle>
        <DialogContent>
          <Stack gap={2} pt={1}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography fontSize={14} color="text.secondary">
              {tr(
                "Conte todo o dinheiro da gaveta, incluindo o fundo de troco. Cartão, Pix e vale não entram na contagem.",
              )}
            </Typography>
            <TextField
              label={tr("Dinheiro contado R$")}
              type="number"
              required
              autoFocus
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <Stack direction="row" justifyContent="space-between">
              <Typography>{tr("Esperado")}</Typography>
              <Typography fontWeight={700}>
                {money(summary.expectedCash)}
              </Typography>
            </Stack>
            {difference !== null && (
              <Alert severity={difference === 0 ? "success" : "warning"}>
                {difference === 0
                  ? tr("Caixa confere.")
                  : (difference > 0 ? tr("Sobra de ") : tr("Falta de ")) +
                    money(Math.abs(difference))}
              </Alert>
            )}
            <TextField
              label={tr("Observações (opcional)")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              inputProps={{ maxLength: 255 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isLoading}>
            {tr("Cancelar")}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="warning"
            disabled={isLoading || counted === ""}
          >
            {tr("Confirmar fechamento")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ReportDialog({
  id,
  summary,
  onClose,
}: {
  id?: number;
  summary?: CashSummary;
  onClose: () => void;
}) {
  const loaded = useData<CashSummary>("/cash/sessions/" + id, !!summary);
  const data = summary || loaded.data;
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({
    contentRef: ref,
    documentTitle: "Caixa-" + (data?.session.id ?? id),
  });
  const { data: settings } = useData<Record<string, string>>("/settings");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {tr("Relatório do caixa")} #{data?.session.id ?? id}
      </DialogTitle>
      <DialogContent>
        <Failure error={loaded.error} />
        {!data ? (
          <Loading />
        ) : (
          <div ref={ref} className="receipt">
            <h2>{settings?.["store.name"] || "Meu Mercadinho"}</h2>
            <p>
              {data.session.status === "OPEN"
                ? "CAIXA ABERTO (PARCIAL)"
                : "FECHAMENTO DE CAIXA"}
              <br />
              Caixa #{data.session.id} • {data.session.user.username}
              <br />
              Abertura: {dateTime(data.session.openedAt)}
              {data.session.closedAt && (
                <>
                  <br />
                  Fechamento: {dateTime(data.session.closedAt)}
                  {data.session.closedBy &&
                    data.session.closedBy.username !==
                      data.session.user.username &&
                    ` por ${data.session.closedBy.username}`}
                </>
              )}
            </p>
            <hr />
            <table>
              <tbody>
                <tr>
                  <td>Vendas ({data.sales})</td>
                  <td className="right">{money(data.salesTotal)}</td>
                </tr>
                {data.payments.map((p) => (
                  <tr key={p.method}>
                    <td>&nbsp;&nbsp;{t(p.method.toLowerCase())}</td>
                    <td className="right">{money(p.total)}</td>
                  </tr>
                ))}
                {data.cancelled > 0 && (
                  <tr>
                    <td>Canceladas</td>
                    <td className="right">{data.cancelled}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <hr />
            <table>
              <tbody>
                <tr>
                  <td>Fundo de troco</td>
                  <td className="right">{money(data.session.openingAmount)}</td>
                </tr>
                <tr>
                  <td>+ Dinheiro das vendas</td>
                  <td className="right">{money(data.cashSales)}</td>
                </tr>
                <tr>
                  <td>+ Fiado recebido</td>
                  <td className="right">{money(data.creditReceipts)}</td>
                </tr>
                <tr>
                  <td>+ Suprimentos</td>
                  <td className="right">{money(data.supplies)}</td>
                </tr>
                <tr>
                  <td>- Sangrias</td>
                  <td className="right">{money(data.withdrawals)}</td>
                </tr>
                <tr>
                  <td>
                    <b>Esperado</b>
                  </td>
                  <td className="right">
                    <b>{money(data.expectedCash)}</b>
                  </td>
                </tr>
                {data.session.countedCash !== null && (
                  <>
                    <tr>
                      <td>Contado</td>
                      <td className="right">
                        {money(data.session.countedCash)}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <b>Diferença</b>
                      </td>
                      <td className="right">
                        <b>{money(data.session.difference ?? 0)}</b>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            {data.movements.length > 0 && (
              <>
                <hr />
                <table>
                  <tbody>
                    {data.movements.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {m.type === "SUPPLY" ? "Suprimento" : "Sangria"} •{" "}
                          {new Date(m.createdAt).toLocaleTimeString("pt-BR")}
                          <br />
                          {m.reason}
                        </td>
                        <td className="right">{money(m.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {data.session.notes && (
              <>
                <hr />
                <p>Obs.: {data.session.notes}</p>
              </>
            )}
            <hr />
            <p style={{ textAlign: "center" }}>
              <br />
              ______________________________
              <br />
              Assinatura do operador
            </p>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr("Fechar")}</Button>
        <Button
          startIcon={<PrintRounded />}
          variant="contained"
          disabled={!data}
          onClick={() => print()}
        >
          {tr("Imprimir")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
