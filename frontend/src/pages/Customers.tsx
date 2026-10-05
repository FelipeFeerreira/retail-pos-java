import { tr } from "../i18n";
import { useState, useRef } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
  AddRounded,
  EditRounded,
  DeleteOutlineRounded,
} from "@mui/icons-material";
import { useReactToPrint } from "react-to-print";
import { useAppSelector, useData, useSendMutation } from "../store";
import type { Customer, Credit, Page } from "../types";
import { errorMessage, money } from "../utils";
import {
  FormDialog,
  Heading,
  Failure,
  useDebounce,
  useNotice,
} from "../components/Common";
export default function Customers() {
  const [search, setSearch] = useState("");
  const query = useDebounce(search);
  const [form, setForm] = useState<Customer | "new" | null>(null);
  const [pay, setPay] = useState<Customer | null>(null);
  const [debit, setDebit] = useState<Customer | null>(null);
  const paymentKey = useRef(crypto.randomUUID());
  const [statement, setStatement] = useState<Customer | null>(null);
  const [bottle, setBottle] = useState<Customer | null>(null);
  const [bottlesOpen, setBottlesOpen] = useState(false);
  const customers = useData<Page<Customer>>(
    "/customers?q=" + encodeURIComponent(query),
  );
  const credits = useData<Credit[]>(
    "/credits?customerId=" + statement?.id,
    !statement,
  );
  const overdue = useData<Credit[]>("/credits/overdue");
  const [send] = useSendMutation();
  const notice = useNotice();
  const manager = useAppSelector((s) => s.auth?.role !== "CASHIER");
  const printRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({
    contentRef: printRef,
    documentTitle: tr("Extrato de fiado"),
  });
  const mutate = async (url: string, method: string, body?: unknown) => {
    try {
      return await send({ url, method, body }).unwrap();
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };
  return (
    <>
      <Heading
        title={tr("Clientes e fiado")}
        subtitle={tr("Uma relação de confiança, com as contas em dia.")}
        action={
          <Stack direction="row" gap={1}>
            <Button variant="outlined" onClick={() => setBottlesOpen(true)}>
              {tr("Cascos emprestados")}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setForm("new")}
            >
              {tr("Novo cliente")}
            </Button>
          </Stack>
        }
      />
      {!!overdue.data?.length && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {new Set(overdue.data.map((d) => d.customer.id)).size} clientes com
          saldo vencido. Consulte o extrato para acompanhar os pagamentos.
        </Alert>
      )}
      <TextField
        placeholder={tr("Buscar cliente pelo nome")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, minWidth: 300 }}
      />
      <Failure error={customers.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              {[
                tr("Cliente"),
                tr("Contato"),
                tr("Limite"),
                tr("Saldo devedor"),
                tr("Disponível"),
                "",
              ].map((h, i) => (
                <TableCell key={i}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {customers.data?.content.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Typography fontWeight={650} fontSize={14}>
                    {c.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.document || tr("Documento não informado")}
                  </Typography>
                </TableCell>
                <TableCell>{c.phone || "—"}</TableCell>
                <TableCell>{money(c.creditLimit)}</TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color:
                      Number(c.balance) > 0 ? "warning.main" : "text.secondary",
                  }}
                >
                  {money(c.balance)}
                </TableCell>
                <TableCell>
                  {money(Number(c.creditLimit) - Number(c.balance))}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Button onClick={() => setBottle(c)}>{tr("Cascos")}</Button>
                  {manager && (
                    <Button onClick={() => setDebit(c)}>
                      Registrar débito
                    </Button>
                  )}
                  <Button onClick={() => setStatement(c)}>
                    {tr("Extrato")}
                  </Button>
                  <Button
                    disabled={Number(c.balance) <= 0}
                    onClick={() => {
                      paymentKey.current = crypto.randomUUID();
                      setPay(c);
                    }}
                  >
                    {tr("Receber")}
                  </Button>
                  <IconButton
                    onClick={() => setForm(c)}
                    aria-label={"Editar " + c.name}
                  >
                    <EditRounded fontSize="small" />
                  </IconButton>
                  {manager && (
                    <IconButton
                      aria-label={"Arquivar " + c.name}
                      onClick={async () => {
                        if (!confirm("Arquivar cliente?")) return;
                        try {
                          await mutate("/customers/" + c.id, "DELETE");
                          notice(tr("Cliente arquivado"));
                        } catch (e) {
                          notice(errorMessage(e), "error");
                        }
                      }}
                    >
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!customers.data?.content.length && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                  {tr("Nenhum cliente encontrado.")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      {form && (
        <FormDialog
          title={form === "new" ? tr("Novo cliente") : tr("Editar cliente")}
          fields={[
            { key: "name", label: tr("Nome completo"), required: true },
            { key: "document", label: tr("CPF/CNPJ (opcional)") },
            { key: "phone", label: tr("Telefone") },
            { key: "address", label: tr("Endereço (opcional)") },
            { key: "note", label: tr("Observação (opcional)") },
            ...(manager
              ? [
                  {
                    key: "creditLimit",
                    label: tr("Limite de fiado (R$)"),
                    type: "number",
                    required: true,
                    min: 0,
                    step: 0.01,
                  },
                  {
                    key: "termDays",
                    label: tr("Prazo do fiado (dias)"),
                    type: "number",
                    min: 0,
                    step: 1,
                    helper: tr(
                      "Vazio: usa o padrão da loja (Financeiro → Configurações)",
                    ),
                  },
                  {
                    key: "interestDay",
                    label: tr("Juros por dia de atraso (%)"),
                    type: "number",
                    min: 0,
                    step: 0.001,
                    helper: tr("Vazio: usa o padrão da loja"),
                  },
                  {
                    key: "penaltyDay",
                    label: tr("Multa por dia de atraso (%)"),
                    type: "number",
                    min: 0,
                    step: 0.001,
                    helper: tr("Vazio: usa o padrão da loja"),
                  },
                ]
              : []),
          ]}
          initial={
            form === "new"
              ? { creditLimit: 0 }
              : (form as unknown as Record<string, unknown>)
          }
          onClose={() => setForm(null)}
          onSave={async (v) => {
            await mutate(
              "/customers" + (form === "new" ? "" : "/" + form.id),
              form === "new" ? "POST" : "PUT",
              {
                ...v,
                creditLimit: manager
                  ? Number(v.creditLimit)
                  : form === "new"
                    ? 0
                    : form.creditLimit,
                ...(manager
                  ? {
                      termDays: v.termDays === "" ? null : Number(v.termDays),
                      interestDay:
                        v.interestDay === "" ? null : Number(v.interestDay),
                      penaltyDay:
                        v.penaltyDay === "" ? null : Number(v.penaltyDay),
                    }
                  : form === "new"
                    ? {}
                    : {
                        termDays: form.termDays,
                        interestDay: form.interestDay,
                        penaltyDay: form.penaltyDay,
                      }),
              },
            );
            notice(tr("Cliente salvo"));
          }}
        />
      )}
      {bottle && (
        <BottleDialog customer={bottle} onClose={() => setBottle(null)} />
      )}
      {bottlesOpen && (
        <OpenBottles
          onClose={() => setBottlesOpen(false)}
          onPick={(c) => {
            setBottlesOpen(false);
            setBottle(c);
          }}
        />
      )}
      {pay && (
        <ReceiveDialog
          customer={pay}
          requestId={paymentKey.current}
          manager={manager}
          onClose={() => setPay(null)}
        />
      )}
      {debit && (
        <DebitDialog customer={debit} onClose={() => setDebit(null)} />
      )}
      <Dialog
        open={!!statement}
        onClose={() => setStatement(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{tr("Extrato de fiado")}</DialogTitle>
        <DialogContent>
          <Box ref={printRef} sx={{ p: 2 }}>
            <Typography variant="h5">{statement?.name}</Typography>
            <Typography mb={3}>
              Saldo:{" "}
              {money(
                customers.data?.content.find((c) => c.id === statement?.id)
                  ?.balance ?? statement?.balance,
              )}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    tr("Data"),
                    tr("Descrição"),
                    tr("Vencimento"),
                    tr("Valor"),
                    tr("Em aberto"),
                  ].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {credits.data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{c.description}</TableCell>
                    <TableCell>{c.dueDate || "—"}</TableCell>
                    <TableCell>{money(c.amount)}</TableCell>
                    <TableCell>{money(c.remaining)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!credits.data?.length && (
              <Typography mt={2}>{tr("Sem movimentações.")}</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatement(null)}>{tr("Fechar")}</Button>
          <Button variant="contained" onClick={() => print()}>
            {tr("Imprimir / PDF")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function DebitDialog({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Compra pendente");
  const [error, setError] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Registrar débito • {customer.name}</DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          <Typography>Saldo devedor atual: {money(customer.balance)}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            type="number"
            label="Valor devido (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0.01, step: 0.01 }}
          />
          <TextField
            label="Motivo / descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />
          <Typography variant="caption" color="text.secondary">
            O débito aparece no extrato. Depois, use Receber para registrar o pagamento.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          disabled={isLoading || !(Number(amount) > 0) || !description.trim()}
          onClick={async () => {
            setError("");
            try {
              await send({
                url: "/credits/debits",
                method: "POST",
                body: { customerId: customer.id, amount: Number(amount), description },
              }).unwrap();
              notice("Débito registrado");
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Confirmar débito
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface Titles {
  principal: number;
  charges: number;
  titles: {
    id: number;
    description: string;
    dueDate: string | null;
    remaining: number;
    daysOverdue: number;
    charges: number;
  }[];
}

/** Receives fiado: principal goes oldest-first; overdue titles add interest and penalty. */
function ReceiveDialog({
  customer,
  requestId,
  manager,
  onClose,
}: {
  customer: Customer;
  requestId: string;
  manager: boolean;
  onClose: () => void;
}) {
  const titles = useData<Titles>("/customers/" + customer.id + "/titles");
  const [amount, setAmount] = useState(String(customer.balance));
  const [method, setMethod] = useState("CASH");
  const [waive, setWaive] = useState(false);
  const [description, setDescription] = useState("Pagamento de fiado");
  const [error, setError] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const principal = Number(amount.replace(",", ".")) || 0;
  let rest = principal;
  let charges = 0;
  for (const t of titles.data?.titles || []) {
    const applied = Math.min(rest, Number(t.remaining));
    if (!waive && applied > 0)
      charges +=
        Math.round((Number(t.charges) * applied * 100) / Number(t.remaining)) /
        100;
    rest -= applied;
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {tr("Receber de")} {customer.name} • {money(customer.balance)}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          {titles.data?.titles.map((t) => (
            <Stack key={t.id} direction="row" gap={1} fontSize={13}>
              <Typography fontSize={13} flex={1}>
                {t.description} •{" "}
                {t.dueDate
                  ? tr("vence") + " " + t.dueDate.split("-").reverse().join("/")
                  : ""}
                {t.daysOverdue > 0 && (
                  <Typography component="span" color="error.main" fontSize={13}>
                    {" "}
                    ({t.daysOverdue} {tr("dias de atraso")})
                  </Typography>
                )}
              </Typography>
              <Typography fontSize={13}>{money(t.remaining)}</Typography>
              {Number(t.charges) > 0 && (
                <Typography fontSize={13} color="error.main">
                  + {money(t.charges)}
                </Typography>
              )}
            </Stack>
          ))}
          <TextField
            label={tr("Valor do principal (R$)")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            helperText={tr(
              "Abate as dívidas mais antigas primeiro. Pode ser parcial.",
            )}
          />
          <TextField
            select
            label={tr("Forma de pagamento")}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            helperText={
              method === "CASH"
                ? tr("Entra na gaveta do seu caixa aberto")
                : tr("Entra na conta bancária")
            }
          >
            <MenuItem value="CASH">{tr("Dinheiro")}</MenuItem>
            <MenuItem value="PIX">Pix</MenuItem>
            <MenuItem value="DEBIT">{tr("Cartão de débito")}</MenuItem>
            <MenuItem value="CREDIT">{tr("Cartão de crédito")}</MenuItem>
          </TextField>
          <TextField
            label={tr("Descrição")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {manager && Number(titles.data?.charges) > 0 && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={waive}
                  onChange={(e) => setWaive(e.target.checked)}
                />
              }
              label={tr("Dispensar juros e multa")}
            />
          )}
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography>{tr("Principal")}</Typography>
              <Typography>{money(principal)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography>{tr("Juros e multa")}</Typography>
              <Typography>{money(charges)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" mt={0.5}>
              <Typography fontWeight={750}>{tr("Total a receber")}</Typography>
              <Typography fontWeight={750}>
                {money(principal + charges)}
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr("Cancelar")}</Button>
        <Button
          variant="contained"
          disabled={isLoading || principal <= 0 || !description.trim()}
          onClick={async () => {
            setError("");
            try {
              await send({
                url: "/credits/payments",
                method: "POST",
                body: {
                  customerId: customer.id,
                  requestId,
                  amount: principal,
                  description,
                  method,
                  waiveCharges: waive,
                },
              }).unwrap();
              notice(tr("Pagamento registrado"));
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          {tr("Confirmar recebimento")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface BottleData {
  balances: { type: string; balance: number }[];
  history: {
    id: number;
    type: string;
    quantity: number;
    note: string;
    createdAt: string;
    username: string;
  }[];
}

/** Returnable bottles: positive balance = customer owes bottles; negative = left extra. */
function BottleDialog({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const data = useData<BottleData>("/customers/" + customer.id + "/bottles");
  const settings = useData<Record<string, string>>("/settings");
  const types = (settings.data?.["bottle.types"] || "Coca")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const chosen = type || types[0];
  const register = async (direction: "TAKEN" | "RETURNED") => {
    try {
      await send({
        url: "/customers/" + customer.id + "/bottles",
        method: "POST",
        body: { type: chosen, quantity: Number(amount), direction, note },
      }).unwrap();
      notice(
        direction === "TAKEN"
          ? tr("Empréstimo registrado")
          : tr("Devolução registrada"),
      );
      setNote("");
    } catch (e) {
      notice(errorMessage(e), "error");
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {tr("Cascos")} • {customer.name}
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
          {data.data?.balances.map((b) => (
            <Paper key={b.type} variant="outlined" sx={{ px: 2, py: 1 }}>
              <Typography fontSize={13} color="text.secondary">
                {b.type}
              </Typography>
              <Typography
                fontWeight={750}
                color={Number(b.balance) > 0 ? "warning.main" : "success.main"}
              >
                {Number(b.balance) > 0
                  ? `${b.balance} ${tr("a devolver")}`
                  : `${-b.balance} ${tr("de crédito")}`}
              </Typography>
            </Paper>
          ))}
          {!data.data?.balances.length && (
            <Typography color="text.secondary">
              {tr("Nenhum casco em aberto.")}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <TextField
            select
            label={tr("Tipo")}
            value={chosen}
            onChange={(e) => setType(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            {types.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={tr("Qtd")}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ width: 90 }}
          />
          <TextField
            label={tr("Observação")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ flex: 1, minWidth: 140 }}
          />
        </Stack>
        <Stack direction="row" gap={1} mt={1.5}>
          <Button
            variant="contained"
            color="warning"
            disabled={isLoading || !(Number(amount) > 0)}
            onClick={() => register("TAKEN")}
          >
            {tr("Levou emprestado")}
          </Button>
          <Button
            variant="contained"
            disabled={isLoading || !(Number(amount) > 0)}
            onClick={() => register("RETURNED")}
          >
            {tr("Devolveu")}
          </Button>
        </Stack>
        <Typography fontWeight={700} mt={3} mb={1}>
          {tr("Histórico")}
        </Typography>
        {data.data?.history.map((h) => (
          <Typography key={h.id} fontSize={13}>
            {new Date(h.createdAt).toLocaleString("pt-BR")} •{" "}
            {h.quantity > 0 ? tr("levou") : tr("devolveu")}{" "}
            {Math.abs(h.quantity)} {h.type}
            {h.note && ` • ${h.note}`} • {h.username}
          </Typography>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr("Fechar")}</Button>
      </DialogActions>
    </Dialog>
  );
}

function OpenBottles({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (c: Customer) => void;
}) {
  const list = useData<
    {
      id: number;
      name: string;
      phone: string | null;
      total: number;
      types: { type: string; balance: number }[];
    }[]
  >("/bottles");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{tr("Cascos emprestados")}</DialogTitle>
      <DialogContent>
        {list.data?.map((c) => (
          <Stack
            key={c.id}
            direction="row"
            alignItems="center"
            py={1}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Box flex={1}>
              <Typography fontWeight={650}>{c.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {c.types.map((t) => `${t.balance} ${t.type}`).join(" • ")}
                {c.phone && ` • ${c.phone}`}
              </Typography>
            </Box>
            <Button
              onClick={() => onPick({ id: c.id, name: c.name } as Customer)}
            >
              {tr("Abrir")}
            </Button>
          </Stack>
        ))}
        {!list.isLoading && !list.data?.length && (
          <Alert severity="success">
            {tr("Nenhum casco emprestado no momento.")}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr("Fechar")}</Button>
      </DialogActions>
    </Dialog>
  );
}
