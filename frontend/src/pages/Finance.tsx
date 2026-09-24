import { tr } from "../i18n";
import { ReactNode, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  AddRounded,
  SwapHorizRounded,
  UploadFileRounded,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useData, useSendMutation } from "../store";
import { errorMessage, money, today } from "../utils";
import {
  Failure,
  FormDialog,
  Heading,
  Loading,
  useNotice,
} from "../components/Common";

export interface Account {
  id: number;
  name: string;
  kind: "CASH" | "BANK";
  openingBalance: number;
  checked: boolean;
  balance: number;
}
export interface Payable {
  id: number;
  description: string;
  category: string;
  document: string;
  amount: number;
  issuedOn: string;
  dueDate: string;
  competence: string;
  purchaseId: number | null;
  supplier: string;
  balance: number;
  daysLeft: number;
}
interface Overview {
  accounts: Account[];
  payablesOverdue: Payable[];
  payablesNext7: Payable[];
  payablesOpen: number;
  cardsOpen: number;
  creditOpen: number;
  creditOverdue: number;
  categories: string[];
  manualIn: string[];
  manualOut: string[];
}
const date = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const monthStart = () => today().slice(0, 8) + "01";
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );

function useMutate() {
  const [send] = useSendMutation();
  return async (url: string, method: string, body?: unknown) => {
    try {
      return await send({ url, method, body }).unwrap();
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };
}

function Period({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <Stack direction="row" gap={1} mb={2} flexWrap="wrap">
      <TextField
        type="date"
        label={tr("De")}
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        type="date"
        label={tr("Até")}
        value={to}
        onChange={(e) => onChange(from, e.target.value)}
        InputLabelProps={{ shrink: true }}
      />
    </Stack>
  );
}

function Stat({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: ReactNode;
  tone?: "error.main" | "warning.main" | "success.main";
  children?: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography color="text.secondary" fontSize={13}>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={750} mt={1} color={tone}>
        {value}
      </Typography>
      {children}
    </Paper>
  );
}

export default function Finance() {
  const [tab, setTab] = useState(0);
  const navigate = useNavigate();
  return (
    <>
      <Heading
        title={tr("Financeiro")}
        subtitle={tr(
          "Dinheiro, banco, contas a pagar, cartões a receber e o resultado do mês.",
        )}
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3 }}
        variant="scrollable"
      >
        <Tab label={tr("Visão geral")} />
        <Tab label={tr("Cartões a receber")} />
        <Tab label={tr("Lançamentos")} />
        <Tab label={tr("Resultado (DRE)")} />
        <Tab label={tr("Fluxo de caixa")} />
        <Tab label={tr("Conciliação bancária")} />
        <Tab label={tr("Configurações")} />
      </Tabs>
      {tab === 0 && <OverviewTab onPayables={() => navigate("/bills")} />}
      {tab === 1 && <Cards />}
      {tab === 2 && <Entries />}
      {tab === 3 && <Dre />}
      {tab === 4 && <Cashflow />}
      {tab === 5 && <Reconciliation />}
      {tab === 6 && <SettingsTab />}
    </>
  );
}

function OverviewTab({ onPayables }: { onPayables: () => void }) {
  const overview = useData<Overview>("/finance/overview");
  const [entry, setEntry] = useState<"IN" | "OUT" | null>(null);
  const [transfer, setTransfer] = useState(false);
  const mutate = useMutate();
  const notice = useNotice();
  const data = overview.data;
  if (overview.isLoading) return <Loading />;
  if (!data) return <Failure error={overview.error} />;
  const accountOptions = data.accounts.map((a) => ({
    value: a.id,
    label: a.name,
  }));
  return (
    <>
      {data.accounts.some((a) => !a.checked) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tr(
            "Informe e confira o saldo inicial das contas em Configurações para os saldos refletirem o dinheiro real.",
          )}
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2,1fr)",
            lg: "repeat(4,1fr)",
          },
          gap: 2,
          mb: 2,
        }}
      >
        {data.accounts.map((a) => (
          <Stat
            key={a.id}
            label={a.name}
            value={money(a.balance)}
            tone={Number(a.balance) < 0 ? "error.main" : undefined}
          />
        ))}
        <Stat label={tr("Cartões a receber")} value={money(data.cardsOpen)} />
        <Stat
          label={tr("Fiado a receber")}
          value={money(data.creditOpen)}
          tone={Number(data.creditOverdue) > 0 ? "warning.main" : undefined}
        >
          {Number(data.creditOverdue) > 0 && (
            <Typography fontSize={12} color="error.main">
              {money(data.creditOverdue)} {tr("vencido")}
            </Typography>
          )}
        </Stat>
      </Box>
      <Stack direction="row" gap={1} mb={3} flexWrap="wrap">
        <Button startIcon={<AddRounded />} onClick={() => setEntry("IN")}>
          {tr("Entrada avulsa")}
        </Button>
        <Button startIcon={<AddRounded />} onClick={() => setEntry("OUT")}>
          {tr("Saída avulsa")}
        </Button>
        <Button
          startIcon={<SwapHorizRounded />}
          onClick={() => setTransfer(true)}
        >
          {tr("Transferir entre contas")}
        </Button>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" },
          gap: 2,
        }}
      >
        {(
          [
            [tr("Contas vencidas"), data.payablesOverdue, "error"],
            [tr("Vencem nos próximos 7 dias"), data.payablesNext7, "warning"],
          ] as const
        ).map(([title, list, color]) => (
          <Paper key={title} variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" alignItems="center" mb={1}>
              <Typography fontWeight={700} flex={1}>
                {title}
              </Typography>
              <Chip
                size="small"
                color={list.length ? color : "default"}
                label={list.length}
              />
            </Stack>
            {list.map((p) => (
              <Stack key={p.id} direction="row" py={0.5} gap={1}>
                <Typography fontSize={14} flex={1}>
                  {p.supplier} • {p.description}
                </Typography>
                <Typography fontSize={13} color="text.secondary">
                  {date(p.dueDate)}
                </Typography>
                <Typography fontSize={14} fontWeight={650}>
                  {money(p.balance)}
                </Typography>
              </Stack>
            ))}
            {!list.length && (
              <Typography color="text.secondary" fontSize={13}>
                {tr("Nada por aqui.")}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
      <Button sx={{ mt: 2 }} onClick={onPayables}>
        {tr("Ver todas as contas a pagar")} ({money(data.payablesOpen)})
      </Button>
      {entry && (
        <FormDialog
          title={entry === "IN" ? tr("Entrada avulsa") : tr("Saída avulsa")}
          fields={[
            {
              key: "category",
              label: tr("Tipo"),
              required: true,
              options: (entry === "IN" ? data.manualIn : data.manualOut).map(
                (c) => ({
                  value: c,
                  label: c,
                }),
              ),
            },
            {
              key: "accountId",
              label: tr("Conta"),
              required: true,
              options: accountOptions,
            },
            {
              key: "amount",
              label: tr("Valor (R$)"),
              type: "number",
              required: true,
              min: 0.01,
              step: 0.01,
            },
            { key: "date", label: tr("Data"), type: "date", required: true },
            { key: "description", label: tr("Descrição"), required: true },
          ]}
          initial={{
            category: entry === "IN" ? data.manualIn[0] : data.manualOut[0],
            accountId: data.accounts[0]?.id,
            date: today(),
          }}
          onClose={() => setEntry(null)}
          onSave={async (v) => {
            await mutate("/finance/entries", "POST", {
              ...v,
              type: entry,
              accountId: Number(v.accountId),
              amount: Number(v.amount),
            });
            notice(tr("Lançamento registrado"));
          }}
        />
      )}
      {transfer && (
        <FormDialog
          title={tr("Transferir entre contas")}
          fields={[
            {
              key: "fromAccountId",
              label: tr("De"),
              required: true,
              options: accountOptions,
            },
            {
              key: "toAccountId",
              label: tr("Para"),
              required: true,
              options: accountOptions,
            },
            {
              key: "amount",
              label: tr("Valor (R$)"),
              type: "number",
              required: true,
              min: 0.01,
              step: 0.01,
            },
            { key: "date", label: tr("Data"), type: "date", required: true },
            {
              key: "description",
              label: tr("Descrição"),
              helper: tr("Ex.: depósito do dinheiro no banco"),
            },
          ]}
          initial={{
            fromAccountId: data.accounts[0]?.id,
            toAccountId: data.accounts[1]?.id,
            date: today(),
          }}
          onClose={() => setTransfer(false)}
          onSave={async (v) => {
            await mutate("/finance/transfers", "POST", {
              ...v,
              fromAccountId: Number(v.fromAccountId),
              toAccountId: Number(v.toAccountId),
              amount: Number(v.amount),
            });
            notice(tr("Transferência registrada"));
          }}
        />
      )}
    </>
  );
}

export function PayableDetail({
  payable,
  onClose,
}: {
  payable: Payable;
  onClose: () => void;
}) {
  const payments = useData<
    {
      id: number;
      principal: number;
      charges: number;
      discount: number;
      paid: number;
      paidOn: string;
      account: string;
      method: string;
      receipt: string;
      reversed: boolean;
      username: string;
    }[]
  >("/finance/payables/" + payable.id + "/payments");
  const mutate = useMutate();
  const notice = useNotice();
  const ask = async (url: string, question: string) => {
    const reason = window.prompt(question);
    if (!reason?.trim()) return;
    try {
      await mutate(url, "POST", { reason });
      notice(tr("Registrado"));
    } catch (e) {
      notice((e as Error).message, "error");
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {payable.supplier} • {payable.description}
      </DialogTitle>
      <DialogContent>
        <Typography fontSize={14} mb={2}>
          {tr("Valor")} {money(payable.amount)} • {tr("saldo")}{" "}
          {money(payable.balance)} • {tr("vence")} {date(payable.dueDate)} •{" "}
          {payable.category}
        </Typography>
        {payments.data?.map((p) => (
          <Stack
            key={p.id}
            direction="row"
            alignItems="center"
            py={0.8}
            gap={1}
          >
            <Box flex={1}>
              <Typography
                fontSize={14}
                sx={{ textDecoration: p.reversed ? "line-through" : undefined }}
              >
                {date(p.paidOn)} • {money(p.paid)} ({tr("principal")}{" "}
                {money(p.principal)}
                {Number(p.charges) > 0 &&
                  ` + ${tr("encargos")} ${money(p.charges)}`}
                {Number(p.discount) > 0 &&
                  ` − ${tr("desconto")} ${money(p.discount)}`}
                )
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {p.account} • {p.method} {p.receipt && `• ${p.receipt}`} •{" "}
                {p.username}
                {p.reversed && ` • ${tr("ESTORNADO")}`}
              </Typography>
            </Box>
            {!p.reversed && (
              <Button
                size="small"
                color="error"
                onClick={() =>
                  ask(
                    "/finance/payable-payments/" + p.id + "/reverse",
                    tr("Motivo do estorno:"),
                  )
                }
              >
                {tr("Estornar")}
              </Button>
            )}
          </Stack>
        ))}
        {!payments.data?.length && (
          <Typography color="text.secondary">
            {tr("Nenhum pagamento.")}
          </Typography>
        )}
        <Button
          color="error"
          sx={{ mt: 2 }}
          onClick={async () => {
            await ask(
              "/finance/payables/" + payable.id + "/cancel",
              tr("Motivo do cancelamento:"),
            );
            onClose();
          }}
        >
          {tr("Cancelar esta conta")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Cards() {
  const [open, setOpen] = useState(true);
  const list = useData<
    {
      id: number;
      saleId: number;
      method: string;
      gross: number;
      fee: number;
      net: number;
      expectedOn: string;
      settledOn: string | null;
      saleDate: string;
    }[]
  >("/finance/card-receivables?open=" + open);
  const [settling, setSettling] = useState<number | null>(null);
  const accounts = useData<Account[]>("/finance/accounts");
  const mutate = useMutate();
  const notice = useNotice();
  const label: Record<string, string> = {
    CREDIT: tr("Crédito"),
    DEBIT: tr("Débito"),
    VOUCHER: tr("Vale"),
  };
  return (
    <>
      <Stack direction="row" gap={1} mb={2}>
        <Chip
          label={tr("A receber")}
          color={open ? "primary" : "default"}
          onClick={() => setOpen(true)}
        />
        <Chip
          label={tr("Recebidos")}
          color={!open ? "primary" : "default"}
          onClick={() => setOpen(false)}
        />
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>
        {tr(
          "Vendas no cartão ficam aqui até a maquininha depositar. Ao liquidar, confira a taxa real cobrada; o valor líquido entra na conta.",
        )}
      </Alert>
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Previsto")}</TableCell>
              <TableCell>{tr("Venda")}</TableCell>
              <TableCell>{tr("Tipo")}</TableCell>
              <TableCell align="right">{tr("Bruto")}</TableCell>
              <TableCell align="right">{tr("Taxa")}</TableCell>
              <TableCell align="right">{tr("Líquido")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {list.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {date(r.expectedOn)}
                  {r.settledOn && ` → ${date(r.settledOn)}`}
                </TableCell>
                <TableCell>
                  #{r.saleId} • {date(r.saleDate)}
                </TableCell>
                <TableCell>{label[r.method] || r.method}</TableCell>
                <TableCell align="right">{money(r.gross)}</TableCell>
                <TableCell align="right">{money(r.fee)}</TableCell>
                <TableCell align="right">{money(r.net)}</TableCell>
                <TableCell align="right">
                  {!r.settledOn && (
                    <Button size="small" onClick={() => setSettling(r.id)}>
                      {tr("Liquidar")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.isLoading && <Loading />}
        {!list.isLoading && !list.data?.length && (
          <Alert severity="success">{tr("Nada pendente.")}</Alert>
        )}
      </Paper>
      {settling !== null && (
        <FormDialog
          title={tr("Liquidar recebível de cartão")}
          fields={[
            {
              key: "fee",
              label: tr("Taxa cobrada (R$)"),
              type: "number",
              min: 0,
              step: 0.01,
              required: true,
            },
            {
              key: "accountId",
              label: tr("Depositado em"),
              required: true,
              options: (accounts.data || []).map((a) => ({
                value: a.id,
                label: a.name,
              })),
            },
          ]}
          initial={{
            fee: list.data?.find((r) => r.id === settling)?.fee,
            accountId: accounts.data?.find((a) => a.kind === "BANK")?.id,
          }}
          onClose={() => setSettling(null)}
          onSave={async (v) => {
            await mutate(
              "/finance/card-receivables/" + settling + "/settle",
              "POST",
              {
                fee: Number(v.fee),
                accountId: Number(v.accountId),
              },
            );
            notice(tr("Recebível liquidado"));
          }}
        />
      )}
    </>
  );
}

function Entries() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [account, setAccount] = useState("");
  const accounts = useData<Account[]>("/finance/accounts");
  const list = useData<
    {
      id: number;
      account: string;
      amount: number;
      date: string;
      category: string;
      description: string;
      source: string;
      reconciled: boolean;
      reversalOf: number | null;
      reversed: boolean;
      username: string;
    }[]
  >(
    `/finance/entries?from=${from}&to=${to}${account ? "&accountId=" + account : ""}`,
  );
  const mutate = useMutate();
  const notice = useNotice();
  return (
    <>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Period
          from={from}
          to={to}
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
        />
        <TextField
          select
          label={tr("Conta")}
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{tr("Todas")}</MenuItem>
          {accounts.data?.map((a) => (
            <MenuItem key={a.id} value={String(a.id)}>
              {a.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Failure error={list.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Data")}</TableCell>
              <TableCell>{tr("Conta")}</TableCell>
              <TableCell>{tr("Categoria")}</TableCell>
              <TableCell>{tr("Descrição")}</TableCell>
              <TableCell align="right">{tr("Valor")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {list.data?.map((e) => (
              <TableRow key={e.id} sx={{ opacity: e.reversed ? 0.5 : 1 }}>
                <TableCell>{date(e.date)}</TableCell>
                <TableCell>{e.account}</TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell>
                  {e.description}
                  {e.reconciled && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="success"
                      label={tr("conciliado")}
                      sx={{ ml: 1 }}
                    />
                  )}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color: Number(e.amount) < 0 ? "error.main" : "success.main",
                    fontWeight: 650,
                  }}
                >
                  {money(e.amount)}
                </TableCell>
                <TableCell align="right">
                  {["MANUAL", "TRANSFER"].includes(e.source) &&
                    !e.reversed &&
                    !e.reversalOf && (
                      <Button
                        size="small"
                        color="error"
                        onClick={async () => {
                          const reason = window.prompt(
                            tr("Motivo do estorno:"),
                          );
                          if (!reason?.trim()) return;
                          try {
                            await mutate(
                              "/finance/entries/" + e.id + "/reverse",
                              "POST",
                              { reason },
                            );
                            notice(tr("Lançamento estornado"));
                          } catch (err) {
                            notice((err as Error).message, "error");
                          }
                        }}
                      >
                        {tr("Estornar")}
                      </Button>
                    )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.isLoading && <Loading />}
        {!list.isLoading && !list.data?.length && (
          <Alert severity="info">{tr("Nenhum lançamento no período.")}</Alert>
        )}
      </Paper>
    </>
  );
}

interface DreData {
  revenue: number;
  fees: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  losses: number;
  internalUse: number;
  expenses: { category: string; total: number }[];
  looseExpenses: number;
  interestReceived: number;
  chargesPaid: number;
  otherIncome: number;
  result: number;
}
function Dre() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const dre = useData<DreData>(`/finance/dre?from=${from}&to=${to}`);
  const d = dre.data;
  const line = (
    label: string,
    value: number,
    strong = false,
    indent = false,
  ) => (
    <Stack
      direction="row"
      py={0.8}
      sx={{
        borderTop: strong ? 1 : 0,
        borderColor: "divider",
        pl: indent ? 3 : 0,
      }}
    >
      <Typography
        flex={1}
        fontWeight={strong ? 750 : 400}
        fontSize={strong ? 15 : 14}
      >
        {label}
      </Typography>
      <Typography
        fontWeight={strong ? 750 : 500}
        fontSize={strong ? 15 : 14}
        color={Number(value) < 0 ? "error.main" : undefined}
      >
        {money(value)}
      </Typography>
    </Stack>
  );
  return (
    <>
      <Period
        from={from}
        to={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
        }}
      />
      <Failure error={dre.error} />
      {!d ? (
        <Loading />
      ) : (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 680 }}>
          {line(tr("Receita de vendas"), d.revenue, true)}
          {line(tr("(−) Taxas de cartão e Pix"), -d.fees, false, true)}
          {line(tr("(−) Custo das mercadorias vendidas"), -d.cogs, false, true)}
          {line(
            tr("= Lucro bruto") + ` (${d.grossMargin}% ${tr("da receita")})`,
            d.grossProfit,
            true,
          )}
          {line(tr("(−) Perdas"), -d.losses, false, true)}
          {line(tr("(−) Consumo interno"), -d.internalUse, false, true)}
          {d.expenses.map((e) =>
            line("(−) " + e.category, -e.total, false, true),
          )}
          {Number(d.looseExpenses) > 0 &&
            line(tr("(−) Despesas avulsas"), -d.looseExpenses, false, true)}
          {Number(d.chargesPaid) !== 0 &&
            line(
              tr("(−) Juros pagos (líquido de descontos)"),
              -d.chargesPaid,
              false,
              true,
            )}
          {Number(d.interestReceived) > 0 &&
            line(
              tr("(+) Juros e multas de fiado"),
              d.interestReceived,
              false,
              true,
            )}
          {Number(d.otherIncome) > 0 &&
            line(tr("(+) Outras receitas"), d.otherIncome, false, true)}
          {line(tr("= Resultado do período"), d.result, true)}
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mt={2}
          >
            {tr(
              "Resultado gerencial por competência. Compras de mercadoria não entram como despesa: o custo aparece quando o produto é vendido, perdido ou consumido.",
            )}
          </Typography>
        </Paper>
      )}
    </>
  );
}

function Cashflow() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const flow = useData<{
    inflows: { category: string; total: number }[];
    outflows: { category: string; total: number }[];
    daily: { day: string; inflow: number | null; outflow: number | null }[];
    net: number;
    accounts: Account[];
  }>(`/finance/cashflow?from=${from}&to=${to}`);
  const d = flow.data;
  return (
    <>
      <Period
        from={from}
        to={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
        }}
      />
      <Failure error={flow.error} />
      {!d ? (
        <Loading />
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" },
              gap: 2,
              mb: 2,
            }}
          >
            {(
              [
                [tr("Entradas"), d.inflows],
                [tr("Saídas"), d.outflows],
              ] as const
            ).map(([title, rows]) => (
              <Paper key={title} variant="outlined" sx={{ p: 2.5 }}>
                <Typography fontWeight={700} mb={1}>
                  {title}:{" "}
                  {money(rows.reduce((s, r) => s + Number(r.total), 0))}
                </Typography>
                {rows.map((r) => (
                  <Stack key={r.category} direction="row" py={0.4}>
                    <Typography fontSize={14} flex={1}>
                      {r.category}
                    </Typography>
                    <Typography fontSize={14}>{money(r.total)}</Typography>
                  </Stack>
                ))}
              </Paper>
            ))}
            <Stat
              label={tr("Saldo do período (sem transferências)")}
              value={money(d.net)}
              tone={Number(d.net) < 0 ? "error.main" : "success.main"}
            />
          </Box>
          <Paper variant="outlined" sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Dia")}</TableCell>
                  <TableCell align="right">{tr("Entradas")}</TableCell>
                  <TableCell align="right">{tr("Saídas")}</TableCell>
                  <TableCell align="right">{tr("Saldo do dia")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.daily.map((r) => (
                  <TableRow key={r.day}>
                    <TableCell>{date(r.day)}</TableCell>
                    <TableCell align="right">{money(r.inflow ?? 0)}</TableCell>
                    <TableCell align="right">{money(r.outflow ?? 0)}</TableCell>
                    <TableCell align="right">
                      {money(Number(r.inflow ?? 0) - Number(r.outflow ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </>
  );
}

function Reconciliation() {
  const accounts = useData<Account[]>("/finance/accounts");
  const bank = accounts.data?.filter((a) => a.kind === "BANK") || [];
  const [account, setAccount] = useState<number | null>(null);
  const selected = account ?? bank[0]?.id ?? null;
  const lines = useData<
    {
      id: number;
      date: string;
      description: string;
      amount: number;
      identifier: string;
      entryId: number | null;
      candidates?: {
        id: number;
        date: string;
        description: string;
        amount: number;
      }[];
    }[]
  >("/finance/statements?accountId=" + selected, selected === null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [send] = useSendMutation();
  const notice = useNotice();
  return (
    <>
      <Stack direction="row" gap={1} mb={2} flexWrap="wrap" alignItems="center">
        <TextField
          select
          label={tr("Conta bancária")}
          value={selected ?? ""}
          onChange={(e) => setAccount(Number(e.target.value))}
          sx={{ minWidth: 220 }}
        >
          {bank.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          startIcon={<UploadFileRounded />}
          onClick={() => fileInput.current?.click()}
          disabled={selected === null}
        >
          {tr("Importar extrato CSV")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || selected === null) return;
            const body = new FormData();
            body.append("file", file);
            try {
              const result = (await send({
                url: "/finance/statements/import?accountId=" + selected,
                method: "POST",
                body,
              }).unwrap()) as { imported: number };
              notice(`${result.imported} ${tr("linhas importadas")}`);
            } catch (err) {
              notice(errorMessage(err), "error");
            }
          }}
        />
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>
        {tr(
          "CSV com cabeçalho data;descricao;valor;identificador (data AAAA-MM-DD). A conciliação só relaciona o extrato a lançamentos que já existem; linhas repetidas são ignoradas pelo identificador.",
        )}
      </Alert>
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Data")}</TableCell>
              <TableCell>{tr("Extrato")}</TableCell>
              <TableCell align="right">{tr("Valor")}</TableCell>
              <TableCell>{tr("Lançamento no sistema")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.data?.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{date(l.date)}</TableCell>
                <TableCell>{l.description}</TableCell>
                <TableCell align="right">{money(l.amount)}</TableCell>
                <TableCell>
                  {l.entryId ? (
                    <Chip
                      size="small"
                      color="success"
                      label={tr("Conciliado")}
                    />
                  ) : l.candidates?.length ? (
                    <Stack gap={0.5}>
                      {l.candidates.map((c) => (
                        <Button
                          key={c.id}
                          size="small"
                          variant="outlined"
                          sx={{ justifyContent: "flex-start" }}
                          onClick={async () => {
                            try {
                              await send({
                                url: `/finance/statements/${l.id}/match?entryId=${c.id}`,
                                method: "POST",
                              }).unwrap();
                              notice(tr("Conciliado"));
                            } catch (err) {
                              notice(errorMessage(err), "error");
                            }
                          }}
                        >
                          {tr("Conciliar com")} {date(c.date)} • {c.description}
                        </Button>
                      ))}
                    </Stack>
                  ) : (
                    <Typography fontSize={13} color="warning.main">
                      {tr(
                        "Sem lançamento correspondente: registre a entrada/saída ou a tarifa.",
                      )}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!lines.isLoading && !lines.data?.length && (
          <Alert severity="info">
            {tr("Nenhuma linha de extrato importada.")}
          </Alert>
        )}
      </Paper>
    </>
  );
}

function SettingsTab() {
  const accounts = useData<Account[]>("/finance/accounts");
  const settings = useData<Record<string, string>>("/settings");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const mutate = useMutate();
  const notice = useNotice();
  const s = settings.data || {};
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" },
        gap: 2,
        alignItems: "start",
      }}
    >
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack direction="row" mb={1.5}>
          <Typography fontWeight={700} flex={1}>
            {tr("Contas")}
          </Typography>
          <Button
            size="small"
            startIcon={<AddRounded />}
            onClick={() => setEditing("new")}
          >
            {tr("Nova conta")}
          </Button>
        </Stack>
        {accounts.data?.map((a) => (
          <Stack
            key={a.id}
            direction="row"
            alignItems="center"
            py={1}
            gap={1}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Box flex={1}>
              <Typography fontWeight={650}>{a.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {a.kind === "CASH" ? tr("Dinheiro") : tr("Banco")} •{" "}
                {tr("saldo inicial")} {money(a.openingBalance)}
              </Typography>
            </Box>
            <Chip
              size="small"
              color={a.checked ? "success" : "warning"}
              variant="outlined"
              label={a.checked ? tr("conferida") : tr("a conferir")}
            />
            <Button size="small" onClick={() => setEditing(a)}>
              {tr("Editar")}
            </Button>
          </Stack>
        ))}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={0.5}>
          {tr("Política padrão do fiado")}
        </Typography>
        <Typography fontSize={13} color="text.secondary" mb={2}>
          {tr(
            "Vale para clientes sem regra própria. Juros e multa são simples, por dia de atraso, sobre o valor em aberto.",
          )}
        </Typography>
        <Stack gap={1.5}>
          {(
            [
              ["credit.termDays", tr("Prazo para pagar (dias)")],
              ["credit.interestDay", tr("Juros por dia de atraso (%)")],
              ["credit.penaltyDay", tr("Multa por dia de atraso (%)")],
            ] as const
          ).map(([key, label]) => (
            <TextField
              key={key + (s[key] ?? "")}
              label={label}
              type="number"
              defaultValue={s[key] ?? ""}
              onBlur={async (e) => {
                if (e.target.value === (s[key] ?? "")) return;
                try {
                  await mutate("/settings", "PUT", { [key]: e.target.value });
                  notice(tr("Configuração salva"));
                } catch (err) {
                  notice((err as Error).message, "error");
                }
              }}
            />
          ))}
        </Stack>
        <Typography fontWeight={700} mt={3} mb={1}>
          {tr("Prazo de depósito da maquininha (dias)")}
        </Typography>
        <Stack direction="row" gap={1.5}>
          {(
            [
              ["card.daysDEBIT", tr("Débito")],
              ["card.daysCREDIT", tr("Crédito")],
              ["card.daysVOUCHER", tr("Vale")],
            ] as const
          ).map(([key, label]) => (
            <TextField
              key={key + (s[key] ?? "")}
              label={label}
              type="number"
              defaultValue={s[key] ?? ""}
              onBlur={async (e) => {
                if (e.target.value === (s[key] ?? "")) return;
                try {
                  await mutate("/settings", "PUT", { [key]: e.target.value });
                  notice(tr("Configuração salva"));
                } catch (err) {
                  notice((err as Error).message, "error");
                }
              }}
            />
          ))}
        </Stack>
      </Paper>
      {editing && (
        <FormDialog
          title={editing === "new" ? tr("Nova conta") : tr("Editar conta")}
          fields={[
            { key: "name", label: tr("Nome"), required: true },
            ...(editing === "new"
              ? [
                  {
                    key: "kind",
                    label: tr("Tipo"),
                    required: true,
                    options: [
                      { value: "CASH", label: tr("Dinheiro") },
                      { value: "BANK", label: tr("Banco") },
                    ],
                  },
                ]
              : []),
            {
              key: "openingBalance",
              label: tr("Saldo inicial (R$)"),
              type: "number",
              required: true,
              step: 0.01,
              helper: tr(
                "Quanto havia na conta antes de começar a usar o sistema",
              ),
            },
            {
              key: "checked",
              label: tr("Saldo conferido?"),
              options: [
                { value: "false", label: tr("Ainda não") },
                { value: "true", label: tr("Sim, conferi") },
              ],
            },
          ]}
          initial={
            editing === "new"
              ? { kind: "BANK", openingBalance: 0, checked: "false" }
              : (editing as unknown as Record<string, unknown>)
          }
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            await mutate(
              "/finance/accounts" + (editing === "new" ? "" : "/" + editing.id),
              editing === "new" ? "POST" : "PUT",
              {
                ...v,
                openingBalance: Number(v.openingBalance),
                checked: v.checked === "true",
              },
            );
            notice(tr("Conta salva"));
          }}
        />
      )}
    </Box>
  );
}
