import { tr } from "../i18n";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  ContentCopyRounded,
  EditRounded,
} from "@mui/icons-material";
import { useData, useSendMutation } from "../store";
import { errorMessage, money, today } from "../utils";
import { parseBoleto } from "../services/boleto";
import {
  Failure,
  FormDialog,
  Heading,
  Loading,
  useNotice,
} from "../components/Common";
import { Account, PayableDetail } from "./Finance";

/** Conta como a API devolve em /finance/bills. */
interface Bill {
  id: number;
  description: string;
  category: string;
  document: string;
  amount: number;
  issuedOn: string;
  dueDate: string;
  competence: string;
  purchaseId: number | null;
  barcode: string | null;
  note: string;
  seriesKind: "MONTHLY" | "INSTALLMENTS" | null;
  installment: number | null;
  installments: number | null;
  supplier: string;
  supplierId: number;
  balance: number;
  paidOn: string | null;
  daysLeft: number;
  status: Status;
}
type Status = "PAID" | "OVERDUE" | "TODAY" | "UPCOMING";
interface Plan {
  balance: number;
  overdue: number;
  days: {
    date: string;
    total: number;
    count: number;
    projectedBalance: number;
  }[];
  weeks: { week: string; total: number }[];
  months: { month: string; total: number }[];
  alerts: Bill[];
  categories: string[];
}

const STATUS: Record<
  Status,
  { label: string; color: "success" | "error" | "warning" | "info" }
> = {
  PAID: { label: "Paga", color: "success" },
  OVERDUE: { label: "Vencida", color: "error" },
  TODAY: { label: "Vence hoje", color: "warning" },
  UPCOMING: { label: "A vencer", color: "info" },
};
const date = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const monthStart = (iso: string) => iso.slice(0, 8) + "01";
const monthEnd = (iso: string) => {
  const d = new Date(iso.slice(0, 8) + "01T12:00:00");
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
};
const shiftMonth = (iso: string, delta: number) => {
  const d = new Date(iso.slice(0, 8) + "01T12:00:00");
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 10);
};
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );

export default function Bills() {
  const [month, setMonth] = useState(monthStart(today()));
  const [from, setFrom] = useState(monthStart(today()));
  const [to, setTo] = useState(monthEnd(today()));
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [form, setForm] = useState<Bill | "new" | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [detail, setDetail] = useState<Bill | null>(null);
  const plan = useData<Plan>(
    `/finance/bills/plan?from=${month}&to=${monthEnd(month)}&alertDays=7`,
  );
  const query = new URLSearchParams({ status });
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (category) query.set("category", category);
  if (supplierId) query.set("supplierId", supplierId);
  const list = useData<Bill[]>("/finance/bills?" + query.toString());
  const suppliers = useData<{ id: number; name: string }[]>("/suppliers");
  const notice = useNotice();
  const alerts = plan.data?.alerts || [];
  const overdue = alerts.filter((a) => a.status === "OVERDUE");
  const dueToday = alerts.filter((a) => a.status === "TODAY");
  const next7 = alerts.filter((a) => a.status === "UPCOMING");
  const sum = (bills: Bill[]) =>
    bills.reduce((s, b) => s + Number(b.balance), 0);
  const monthTotal = (plan.data?.months || []).reduce(
    (s, m) => s + Number(m.total),
    0,
  );
  return (
    <>
      <Heading
        title={tr("Contas e Boletos")}
        subtitle={tr("Vencimentos, pagamentos e o planejamento do mês.")}
        action={
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            onClick={() => setForm("new")}
          >
            {tr("Nova conta")}
          </Button>
        }
      />
      <Failure error={plan.error || list.error} />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5,1fr)" },
          gap: 2,
          mb: 2,
        }}
      >
        {(
          [
            [tr("Saldo dinheiro + banco"), plan.data?.balance, undefined],
            [
              tr("Vencidas"),
              sum(overdue),
              overdue.length ? "error.main" : undefined,
            ],
            [
              tr("Vencem hoje"),
              sum(dueToday),
              dueToday.length ? "warning.main" : undefined,
            ],
            [tr("Próximos 7 dias"), sum(next7), undefined],
            [tr("A pagar no mês"), monthTotal, undefined],
          ] as const
        ).map(([label, value, color]) => (
          <Paper key={label} variant="outlined" sx={{ p: 2 }}>
            <Typography color="text.secondary" fontSize={13}>
              {label}
            </Typography>
            <Typography variant="h6" fontWeight={750} color={color}>
              {money(value ?? 0)}
            </Typography>
          </Paper>
        ))}
      </Box>
      {(overdue.length > 0 || dueToday.length > 0) && (
        <Alert severity={overdue.length ? "error" : "warning"} sx={{ mb: 2 }}>
          {overdue.length > 0 &&
            `${overdue.length} ${tr("conta(s) vencida(s)")}: ${overdue.map((b) => b.description).join(", ")}. `}
          {dueToday.length > 0 &&
            `${dueToday.length} ${tr("vence(m) hoje")}: ${dueToday.map((b) => b.description).join(", ")}.`}
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0,2fr) minmax(0,1fr)" },
          gap: 2,
          mb: 3,
          alignItems: "start",
        }}
      >
        <Calendar
          month={month}
          plan={plan.data}
          onMonth={setMonth}
          onDay={(day) => {
            setFrom(day);
            setTo(day);
            setStatus("ALL");
          }}
        />
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} mb={1}>
            {tr("Total a pagar por semana")}
          </Typography>
          {plan.data?.weeks.map((w) => (
            <Stack key={w.week} direction="row" py={0.4}>
              <Typography fontSize={14} flex={1}>
                {tr("Semana de")} {date(w.week)}
              </Typography>
              <Typography fontSize={14} fontWeight={650}>
                {money(w.total)}
              </Typography>
            </Stack>
          ))}
          {!plan.data?.weeks.length && (
            <Typography fontSize={13} color="text.secondary">
              {tr("Nenhuma conta em aberto neste mês.")}
            </Typography>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mt={2}
          >
            {tr(
              "Saldo projetado = saldo atual de dinheiro e banco menos as contas em aberto até cada dia (as vencidas já descontadas).",
            )}
          </Typography>
        </Paper>
      </Box>
      <Stack
        direction="row"
        gap={1}
        mb={1.5}
        flexWrap="wrap"
        alignItems="center"
      >
        <TextField
          type="date"
          label={tr("Vence de")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          label={tr("até")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          select
          label={tr("Status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="ALL">{tr("Todas")}</MenuItem>
          <MenuItem value="OPEN">{tr("Em aberto")}</MenuItem>
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <MenuItem key={s} value={s}>
              {tr(STATUS[s].label)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={tr("Categoria")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">{tr("Todas")}</MenuItem>
          {plan.data?.categories.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={tr("Fornecedor")}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">{tr("Todos")}</MenuItem>
          {suppliers.data?.map((s) => (
            <MenuItem key={s.id} value={String(s.id)}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        <Button
          onClick={() => {
            setFrom("");
            setTo("");
            setStatus("OPEN");
            setCategory("");
            setSupplierId("");
          }}
        >
          {tr("Todas em aberto")}
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Vencimento")}</TableCell>
              <TableCell>{tr("Status")}</TableCell>
              <TableCell>{tr("Descrição")}</TableCell>
              <TableCell>{tr("Fornecedor")}</TableCell>
              <TableCell>{tr("Categoria")}</TableCell>
              <TableCell align="right">{tr("Valor")}</TableCell>
              <TableCell align="right">{tr("Saldo")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {list.data?.map((b) => (
              <TableRow key={b.id} hover>
                <TableCell>{date(b.dueDate)}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={STATUS[b.status].color}
                    variant={b.status === "UPCOMING" ? "outlined" : "filled"}
                    label={
                      b.status === "PAID" && b.paidOn
                        ? `${tr("Paga")} ${date(b.paidOn)}`
                        : tr(STATUS[b.status].label)
                    }
                  />
                </TableCell>
                <TableCell>
                  {b.description}
                  {(b.note || b.barcode) && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {b.note}
                      {b.barcode && (
                        <Tooltip title={tr("Copiar linha digitável")}>
                          <IconButton
                            size="small"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(b.barcode!);
                                notice(tr("Linha digitável copiada"));
                              } catch {
                                notice(b.barcode!, "info");
                              }
                            }}
                          >
                            <ContentCopyRounded sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{b.supplier}</TableCell>
                <TableCell>{b.category}</TableCell>
                <TableCell align="right">{money(b.amount)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 650 }}>
                  {money(b.balance)}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <IconButton
                    size="small"
                    title={tr("Editar")}
                    onClick={() => setForm(b)}
                  >
                    <EditRounded fontSize="small" />
                  </IconButton>
                  <Button size="small" onClick={() => setDetail(b)}>
                    {tr("Histórico")}
                  </Button>
                  {b.status !== "PAID" && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setPaying(b)}
                    >
                      {tr("Pagar")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.isLoading && <Loading />}
        {!list.isLoading && !list.data?.length && (
          <Alert severity="info">
            {tr("Nenhuma conta com esses filtros.")}
          </Alert>
        )}
      </Paper>
      {form && (
        <BillForm
          bill={form === "new" ? undefined : form}
          categories={plan.data?.categories || []}
          suppliers={suppliers.data || []}
          onClose={() => setForm(null)}
        />
      )}
      {paying && <PayDialog bill={paying} onClose={() => setPaying(null)} />}
      {detail && (
        <PayableDetail
          payable={{ ...detail, purchaseId: detail.purchaseId }}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

/** Calendário do mês: total a pagar por dia e o saldo projetado. */
function Calendar({
  month,
  plan,
  onMonth,
  onDay,
}: {
  month: string;
  plan?: Plan;
  onMonth: (m: string) => void;
  onDay: (day: string) => void;
}) {
  const cells = useMemo(() => {
    const first = new Date(month + "T12:00:00");
    const offset = (first.getDay() + 6) % 7; // semana começa na segunda
    const days = Number(monthEnd(month).slice(8, 10));
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from(
        { length: days },
        (_, i) => month.slice(0, 8) + String(i + 1).padStart(2, "0"),
      ),
    ];
  }, [month]);
  const byDay = new Map((plan?.days || []).map((d) => [d.date, d]));
  const now = today();
  const raw = new Date(month + "T12:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  // Só a primeira letra maiúscula: "Setembro de 2026".
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" mb={1}>
        <IconButton onClick={() => onMonth(shiftMonth(month, -1))}>
          <ChevronLeftRounded />
        </IconButton>
        <Typography fontWeight={700} flex={1} textAlign="center">
          {label}
        </Typography>
        <IconButton onClick={() => onMonth(shiftMonth(month, 1))}>
          <ChevronRightRounded />
        </IconButton>
      </Stack>
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 0.5 }}
      >
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <Typography
            key={d}
            fontSize={12}
            color="text.secondary"
            textAlign="center"
          >
            {tr(d)}
          </Typography>
        ))}
        {cells.map((day, i) => {
          if (!day) return <Box key={"e" + i} />;
          const info = byDay.get(day);
          const past = day < now;
          return (
            <Box
              key={day}
              onClick={() => onDay(day)}
              sx={{
                minHeight: 64,
                p: 0.6,
                borderRadius: 1.5,
                cursor: "pointer",
                border: 1,
                borderColor: day === now ? "primary.main" : "divider",
                bgcolor: info
                  ? past
                    ? "error.main"
                    : "action.hover"
                  : undefined,
                color: info && past ? "error.contrastText" : undefined,
                "&:hover": { borderColor: "primary.main" },
              }}
            >
              <Typography fontSize={12} fontWeight={day === now ? 800 : 500}>
                {Number(day.slice(8))}
              </Typography>
              {info && (
                <>
                  <Typography fontSize={12} fontWeight={750}>
                    {money(info.total)}
                  </Typography>
                  {!past && (
                    <Typography
                      fontSize={10}
                      color={
                        Number(info.projectedBalance) < 0
                          ? "error.main"
                          : "text.secondary"
                      }
                    >
                      {tr("saldo")} {money(info.projectedBalance)}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

/** Cadastro e edição: linha digitável preenche valor e vencimento; recorrente ou parcelada. */
function BillForm({
  bill,
  categories,
  suppliers,
  onClose,
}: {
  bill?: Bill;
  categories: string[];
  suppliers: { id: number; name: string }[];
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    supplierId: bill ? String(bill.supplierId) : "",
    description: bill?.description ?? "",
    category: bill?.category ?? "Despesas fixas",
    document: bill?.document ?? "",
    amount: bill ? String(bill.amount) : "",
    dueDate: bill?.dueDate?.slice(0, 10) ?? today(),
    barcode: bill?.barcode ?? "",
    note: bill?.note ?? "",
    repeat: "NONE",
    times: "12",
  });
  const [error, setError] = useState("");
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const boleto = values.barcode.trim() ? parseBoleto(values.barcode) : null;
  const set = (patch: Partial<typeof values>) =>
    setValues({ ...values, ...patch });
  const amount = Number(values.amount.replace(",", "."));
  const times = Number(values.times);
  return (
    <Dialog
      open
      onClose={isLoading ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        {bill ? tr("Editar conta") : tr("Nova conta ou boleto")}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={tr("Linha digitável ou código de barras (opcional)")}
            value={values.barcode}
            onChange={(e) => {
              const parsed = parseBoleto(e.target.value);
              set({
                barcode: e.target.value,
                ...(parsed.valid && parsed.amount && !bill
                  ? { amount: String(parsed.amount) }
                  : {}),
                ...(parsed.valid && parsed.dueDate && !bill
                  ? { dueDate: parsed.dueDate }
                  : {}),
              });
            }}
            error={!!boleto && !boleto.valid && boleto.digits.length >= 44}
            helperText={
              !boleto
                ? tr(
                    "Cole ou digite: valor e vencimento são preenchidos quando o boleto informa",
                  )
                : boleto.valid
                  ? `${tr("Boleto válido")}${boleto.amount ? " • " + money(boleto.amount) : ""}${boleto.dueDate ? " • " + tr("vence") + " " + date(boleto.dueDate) : ""}`
                  : boleto.error
            }
          />
          {newSupplier === null ? (
            <TextField
              select
              label={tr("Fornecedor / credor")}
              value={values.supplierId}
              onChange={(e) =>
                e.target.value === "new"
                  ? setNewSupplier("")
                  : set({ supplierId: e.target.value })
              }
              required
            >
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.name}
                </MenuItem>
              ))}
              <MenuItem value="new" sx={{ fontWeight: 700 }}>
                + {tr("Cadastrar novo fornecedor")}
              </MenuItem>
            </TextField>
          ) : (
            <Stack direction="row" gap={1} alignItems="flex-start">
              <TextField
                autoFocus
                label={tr("Nome do novo fornecedor / credor")}
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                sx={{ flex: 1 }}
              />
              <Button
                variant="contained"
                disabled={!newSupplier.trim() || isLoading}
                sx={{ mt: 1 }}
                onClick={async () => {
                  try {
                    const created = (await send({
                      url: "/suppliers",
                      method: "POST",
                      body: { name: newSupplier.trim() },
                    }).unwrap()) as { id: number };
                    set({ supplierId: String(created.id) });
                    setNewSupplier(null);
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                {tr("Salvar")}
              </Button>
              <Button sx={{ mt: 1 }} onClick={() => setNewSupplier(null)}>
                {tr("Cancelar")}
              </Button>
            </Stack>
          )}
          <TextField
            label={tr("Descrição")}
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            required
          />
          <Stack direction="row" gap={2}>
            <TextField
              select
              label={tr("Categoria")}
              value={values.category}
              onChange={(e) => set({ category: e.target.value })}
              sx={{ flex: 1 }}
            >
              {categories.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={tr("Documento (opcional)")}
              value={values.document}
              onChange={(e) => set({ document: e.target.value })}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Stack direction="row" gap={2}>
            <TextField
              label={
                values.repeat === "INSTALLMENTS"
                  ? tr("Valor total (R$)")
                  : tr("Valor (R$)")
              }
              value={values.amount}
              onChange={(e) => set({ amount: e.target.value })}
              required
              sx={{ flex: 1 }}
            />
            <TextField
              type="date"
              label={
                values.repeat === "NONE"
                  ? tr("Vencimento")
                  : tr("Primeiro vencimento")
              }
              value={values.dueDate}
              onChange={(e) => set({ dueDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              required
              sx={{ flex: 1 }}
            />
          </Stack>
          {!bill && (
            <Stack direction="row" gap={2}>
              <TextField
                select
                label={tr("Repetição")}
                value={values.repeat}
                onChange={(e) =>
                  set({
                    repeat: e.target.value,
                    times: e.target.value === "INSTALLMENTS" ? "3" : "12",
                  })
                }
                sx={{ flex: 1 }}
              >
                <MenuItem value="NONE">{tr("Conta única")}</MenuItem>
                <MenuItem value="MONTHLY">
                  {tr("Recorrente: todo mês")}
                </MenuItem>
                <MenuItem value="INSTALLMENTS">
                  {tr("Parcelada: a cada 30 dias")}
                </MenuItem>
              </TextField>
              {values.repeat !== "NONE" && (
                <TextField
                  type="number"
                  label={
                    values.repeat === "MONTHLY"
                      ? tr("Quantos meses")
                      : tr("Parcelas")
                  }
                  value={values.times}
                  onChange={(e) => set({ times: e.target.value })}
                  inputProps={{ min: 2, max: 60 }}
                  sx={{ width: 140 }}
                />
              )}
            </Stack>
          )}
          {!bill && values.repeat !== "NONE" && amount > 0 && times >= 2 && (
            <Alert severity="info">
              {values.repeat === "MONTHLY"
                ? `${tr("Serão criadas")} ${times} ${tr("contas de")} ${money(amount)}, ${tr("uma por mês, que você pode editar ou cancelar uma a uma.")}`
                : `${times} ${tr("parcelas de")} ${money(Math.floor((amount * 100) / times) / 100)} ${tr("(a última ajusta os centavos), a cada 30 dias.")}`}
            </Alert>
          )}
          <TextField
            label={tr("Observação")}
            value={values.note}
            onChange={(e) => set({ note: e.target.value })}
            inputProps={{ maxLength: 255 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          {tr("Cancelar")}
        </Button>
        <Button
          variant="contained"
          disabled={
            isLoading ||
            !values.supplierId ||
            !values.description.trim() ||
            !(amount > 0) ||
            (!!boleto && !boleto.valid)
          }
          onClick={async () => {
            setError("");
            const body = {
              supplierId: Number(values.supplierId),
              description: values.description,
              category: values.category,
              document: values.document,
              amount,
              dueDate: values.dueDate,
              barcode: boleto?.valid ? boleto.digits : null,
              note: values.note,
            };
            try {
              if (bill)
                await send({
                  url: "/finance/payables/" + bill.id,
                  method: "PUT",
                  body,
                }).unwrap();
              else
                await send({
                  url: "/finance/payables",
                  method: "POST",
                  body: {
                    ...body,
                    repeat: values.repeat,
                    times: values.repeat === "NONE" ? null : times,
                  },
                }).unwrap();
              notice(bill ? tr("Conta atualizada") : tr("Conta cadastrada"));
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          {tr("Salvar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Marcar como paga: valor (pode ser parcial), juros/multa, desconto, conta e forma. */
function PayDialog({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const accounts = useData<Account[]>("/finance/accounts");
  const [send] = useSendMutation();
  const notice = useNotice();
  const key = useRef(uuid());
  if (!accounts.data) return null;
  return (
    <FormDialog
      title={tr("Pagar") + " • " + bill.description}
      fields={[
        {
          key: "principal",
          label: tr("Valor da conta pago agora (R$)"),
          type: "number",
          required: true,
          min: 0.01,
          step: 0.01,
          helper: tr("Pode ser parcial"),
        },
        {
          key: "charges",
          label: tr("Juros/multa (R$)"),
          type: "number",
          min: 0,
          step: 0.01,
        },
        {
          key: "discount",
          label: tr("Desconto (R$)"),
          type: "number",
          min: 0,
          step: 0.01,
        },
        {
          key: "accountId",
          label: tr("Pago com"),
          required: true,
          options: (accounts.data || []).map((a) => ({
            value: a.id,
            label: a.name,
          })),
        },
        {
          key: "method",
          label: tr("Forma de pagamento"),
          required: true,
          options: ["Pix", "Boleto", "Dinheiro", "Transferência", "Cartão"].map(
            (m) => ({
              value: m,
              label: m,
            }),
          ),
        },
        {
          key: "paidOn",
          label: tr("Data do pagamento"),
          type: "date",
          required: true,
        },
        { key: "receipt", label: tr("Comprovante / autenticação") },
      ]}
      initial={{
        principal: bill.balance,
        charges: 0,
        discount: 0,
        accountId: accounts.data?.find((a) => a.kind === "BANK")?.id,
        method: bill.barcode ? "Boleto" : "Pix",
        paidOn: today(),
      }}
      onClose={onClose}
      onSave={async (v) => {
        try {
          await send({
            url: "/finance/payables/" + bill.id + "/payments",
            method: "POST",
            body: {
              ...v,
              requestId: key.current,
              principal: Number(v.principal),
              charges: Number(v.charges || 0),
              discount: Number(v.discount || 0),
              accountId: Number(v.accountId),
            },
          }).unwrap();
          notice(tr("Pagamento registrado"));
        } catch (e) {
          throw new Error(errorMessage(e));
        }
      }}
    />
  );
}
