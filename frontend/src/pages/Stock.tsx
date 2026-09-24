import { tr } from "../i18n";
import { Fragment, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
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
  DeleteOutlineRounded,
  EditRounded,
  DeleteForeverRounded,
} from "@mui/icons-material";
import { useAppSelector, useData, useSendMutation } from "../store";
import type { Lot, Page, Product, Writeoff, WriteoffSummary } from "../types";
import { errorMessage, money, qty, today } from "../utils";
import {
  Failure,
  FormDialog,
  Heading,
  Loading,
  useDebounce,
  useNotice,
} from "../components/Common";

const date = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR");
const daysAgo = (days: number) => {
  const d = new Date(today() + "T12:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export default function Stock() {
  const [tab, setTab] = useState(0);
  return (
    <>
      <Heading
        title={tr("Estoque")}
        subtitle={tr(
          "Validade por lote, perdas, consumo interno e inventário.",
        )}
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3 }}
        variant="scrollable"
      >
        <Tab label={tr("Validades")} />
        <Tab label={tr("Perdas")} />
        <Tab label={tr("Consumo interno")} />
        <Tab label={tr("Inventário")} />
      </Tabs>
      {tab === 0 && <Lots />}
      {tab === 1 && <Writeoffs kind="LOSS" />}
      {tab === 2 && <Writeoffs kind="INTERNAL" />}
      {tab === 3 && <Inventory />}
    </>
  );
}

export function ProductPicker({
  value,
  onChange,
  label = tr("Produto"),
}: {
  value: Product | null;
  onChange: (p: Product | null) => void;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const query = useDebounce(search);
  const products = useData<Page<Product>>(
    "/products?size=20&q=" + encodeURIComponent(query),
  );
  return (
    <Autocomplete
      options={products.data?.content || []}
      value={value}
      onChange={(_, p) => onChange(p)}
      onInputChange={(_, v) => setSearch(v)}
      getOptionLabel={(p) => `${p.name} • #${p.code}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(x) => x}
      renderInput={(params) => <TextField {...params} label={label} />}
      sx={{ flex: 1, minWidth: 220 }}
    />
  );
}

function Lots() {
  const manager = useAppSelector((s) => s.auth?.role !== "CASHIER");
  const [onlyExpiring, setOnlyExpiring] = useState(true);
  const lots = useData<Lot[]>("/lots" + (onlyExpiring ? "?days=7" : ""));
  const [send] = useSendMutation();
  const notice = useNotice();
  const [form, setForm] = useState<Lot | "new" | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const writeOff = async (lot: Lot) => {
    if (
      !window.confirm(
        `Registrar ${qty(lot.quantity)} ${lot.unit} de ${lot.productName} como perda por validade vencida?`,
      )
    )
      return;
    try {
      await send({
        url: "/writeoffs",
        method: "POST",
        body: {
          kind: "LOSS",
          reason: "Validade vencida",
          note: "Lote #" + lot.id,
          items: [
            {
              productId: lot.productId,
              quantity: Number(lot.quantity),
              lotId: lot.id,
            },
          ],
        },
      }).unwrap();
      notice(tr("Perda registrada"));
    } catch (e) {
      notice(errorMessage(e), "error");
    }
  };
  return (
    <>
      <Stack direction="row" gap={1} mb={2} flexWrap="wrap" alignItems="center">
        <Chip
          label={tr("Vencendo em até 7 dias")}
          color={onlyExpiring ? "primary" : "default"}
          onClick={() => setOnlyExpiring(true)}
        />
        <Chip
          label={tr("Todos os lotes")}
          color={!onlyExpiring ? "primary" : "default"}
          onClick={() => setOnlyExpiring(false)}
        />
        <Box flex={1} />
        {manager && (
          <Button startIcon={<AddRounded />} onClick={() => setForm("new")}>
            {tr("Registrar lote")}
          </Button>
        )}
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>
        {tr(
          "Entradas com validade criam lotes automaticamente. Vendas saem do lote que vence primeiro; lote vencido só sai como perda.",
        )}
      </Alert>
      <Failure error={lots.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Produto")}</TableCell>
              <TableCell align="right">{tr("Quantidade")}</TableCell>
              <TableCell>{tr("Validade")}</TableCell>
              <TableCell>{tr("Situação")}</TableCell>
              <TableCell>{tr("Observação")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {lots.data?.map((l) => (
              <TableRow key={l.id} hover>
                <TableCell>{l.productName}</TableCell>
                <TableCell align="right">
                  {qty(l.quantity)} {l.unit}
                </TableCell>
                <TableCell>{date(l.expiresOn)}</TableCell>
                <TableCell>
                  {l.daysLeft === null ? (
                    "—"
                  ) : l.daysLeft < 0 ? (
                    <Chip size="small" color="error" label={tr("Vencido")} />
                  ) : (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={l.daysLeft <= 7 ? "warning" : "success"}
                      label={
                        l.daysLeft === 0
                          ? tr("Vence hoje")
                          : `${l.daysLeft} ${tr("dias")}`
                      }
                    />
                  )}
                </TableCell>
                <TableCell>{l.note}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {manager && (
                    <>
                      <IconButton
                        size="small"
                        title={tr("Editar")}
                        onClick={() => setForm(l)}
                      >
                        <EditRounded fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteForeverRounded />}
                        onClick={() => writeOff(l)}
                      >
                        {tr("Registrar como perda")}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {lots.isLoading && <Loading />}
        {!lots.isLoading && !lots.data?.length && (
          <Alert severity="success">
            {onlyExpiring
              ? tr("Nenhum lote vencido ou vencendo nos próximos 7 dias.")
              : tr("Nenhum lote cadastrado.")}
          </Alert>
        )}
      </Paper>
      {form === "new" && (
        <FormDialog
          title={tr("Registrar lote do estoque atual")}
          fields={[
            {
              key: "quantity",
              label: tr("Quantidade"),
              type: "number",
              required: true,
              min: 0.001,
              step: 0.001,
            },
            { key: "expiresOn", label: tr("Validade"), type: "date" },
            { key: "note", label: tr("Observação") },
          ]}
          onClose={() => {
            setForm(null);
            setProduct(null);
          }}
          onSave={async (v) => {
            if (!product) throw new Error(tr("Selecione o produto"));
            try {
              await send({
                url: "/lots",
                method: "POST",
                body: {
                  productId: product.id,
                  quantity: Number(v.quantity),
                  expiresOn: v.expiresOn || null,
                  note: v.note,
                },
              }).unwrap();
              notice(tr("Lote registrado"));
              setProduct(null);
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
          header={
            <>
              <ProductPicker value={product} onChange={setProduct} />
              <Typography variant="caption" color="text.secondary">
                {tr(
                  "Use para detalhar a validade do estoque que já existe. Mercadoria nova entra por Produtos → Movimentar → Entrada.",
                )}
              </Typography>
            </>
          }
        />
      )}
      {form && form !== "new" && (
        <FormDialog
          title={tr("Editar lote") + " • " + form.productName}
          fields={[
            {
              key: "quantity",
              label: tr("Quantidade"),
              type: "number",
              required: true,
              min: 0,
              step: 0.001,
            },
            { key: "expiresOn", label: tr("Validade"), type: "date" },
            { key: "note", label: tr("Observação") },
          ]}
          initial={{
            quantity: form.quantity,
            expiresOn: form.expiresOn?.slice(0, 10) ?? "",
            note: form.note,
          }}
          onClose={() => setForm(null)}
          onSave={async (v) => {
            try {
              await send({
                url: "/lots/" + form.id,
                method: "PUT",
                body: {
                  quantity: Number(v.quantity),
                  expiresOn: v.expiresOn || null,
                  note: v.note,
                },
              }).unwrap();
              notice(tr("Lote atualizado"));
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      )}
    </>
  );
}

const PERIODS = [
  ["7", "7 dias"],
  ["30", "30 dias"],
  ["month", "Este mês"],
] as const;

function Writeoffs({ kind }: { kind: "LOSS" | "INTERNAL" }) {
  const manager = useAppSelector((s) => s.auth?.role !== "CASHIER");
  const loss = kind === "LOSS";
  const [period, setPeriod] = useState<string>("30");
  const from =
    period === "month"
      ? today().slice(0, 8) + "01"
      : daysAgo(Number(period) - 1);
  const summary = useData<WriteoffSummary>(
    `/writeoffs/summary?kind=${kind}&from=${from}&to=${today()}`,
  );
  const [page, setPage] = useState(0);
  const history = useData<Page<Writeoff>>(
    `/writeoffs?kind=${kind}&page=${page}`,
  );
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        {(
          [
            [
              loss ? tr("Perdido hoje") : tr("Consumido hoje"),
              summary.data?.today,
            ],
            [tr("Esta semana"), summary.data?.week],
            [tr("Este mês"), summary.data?.month],
          ] as const
        ).map(([label, value]) => (
          <Paper key={label} variant="outlined" sx={{ p: 2.5 }}>
            <Typography color="text.secondary" fontSize={13}>
              {label}
            </Typography>
            <Typography
              variant="h5"
              fontWeight={750}
              mt={1}
              color={loss && Number(value) > 0 ? "error.main" : undefined}
            >
              {money(value)}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(0,1.1fr) minmax(0,1fr)",
          },
          gap: 2,
          alignItems: "start",
        }}
      >
        {manager ? (
          <WriteoffForm kind={kind} reasons={summary.data?.reasons || []} />
        ) : (
          <Alert severity="info">
            {tr("Somente gerente ou administrador registra baixas.")}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" mb={1.5} gap={1}>
            <Typography fontWeight={700} flex={1}>
              {tr("Gasto por motivo")}
            </Typography>
            <TextField
              select
              size="small"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {PERIODS.map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {tr(l)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {summary.data?.byReason.map((r) => (
            <Stack key={r.reason} direction="row" py={0.7} gap={1}>
              <Typography fontSize={14} flex={1}>
                {r.reason}
              </Typography>
              <Typography fontSize={13} color="text.secondary">
                {r.count}×
              </Typography>
              <Typography fontSize={14} fontWeight={650}>
                {money(r.total)}
              </Typography>
            </Stack>
          ))}
          {!summary.data?.byReason.length && (
            <Typography color="text.secondary" fontSize={13}>
              {tr("Nada registrado no período.")}
            </Typography>
          )}
        </Paper>
      </Box>
      <Typography fontWeight={700} mt={4} mb={1.5}>
        {tr("Histórico")}
      </Typography>
      <Failure error={history.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>{tr("Data")}</TableCell>
              <TableCell>{tr("Motivo")}</TableCell>
              <TableCell>{tr("Itens")}</TableCell>
              <TableCell>{tr("Operador")}</TableCell>
              <TableCell align="right">{tr("Custo")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.data?.content.map((w) => (
              <Fragment key={w.id}>
                <TableRow
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => setOpen(open === w.id ? null : w.id)}
                >
                  <TableCell>{w.id}</TableCell>
                  <TableCell>{dateTime(w.createdAt)}</TableCell>
                  <TableCell>{w.reason}</TableCell>
                  <TableCell>
                    {w.items.length === 1
                      ? w.items[0].productName
                      : `${w.items.length} ${tr("produtos")}`}
                  </TableCell>
                  <TableCell>{w.user.username}</TableCell>
                  <TableCell align="right">{money(w.totalCost)}</TableCell>
                </TableRow>
                {open === w.id && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ bgcolor: "action.hover" }}>
                      {w.items.map((i) => (
                        <Typography key={i.id} fontSize={13}>
                          {qty(i.quantity)} {i.unit} × {i.productName} ×{" "}
                          {money(i.unitCost)} = {money(i.total)}
                        </Typography>
                      ))}
                      {w.note && (
                        <Typography
                          fontSize={13}
                          color="text.secondary"
                          mt={0.5}
                        >
                          {tr("Obs.:")} {w.note}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {history.isLoading && <Loading />}
        {!history.isLoading && !history.data?.content.length && (
          <Alert severity="info">{tr("Nenhum registro ainda.")}</Alert>
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
    </>
  );
}

function WriteoffForm({
  kind,
  reasons,
}: {
  kind: "LOSS" | "INTERNAL";
  reasons: string[];
}) {
  const loss = kind === "LOSS";
  const [product, setProduct] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState<{ product: Product; quantity: number }[]>(
    [],
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const total = items.reduce(
    (sum, i) => sum + Number(i.product.cost) * i.quantity,
    0,
  );
  const add = () => {
    const quantity = Number(amount.replace(",", "."));
    if (!product || !(quantity > 0)) return;
    if (product.unit === "UN" && !Number.isInteger(quantity)) {
      notice(tr("Produto vendido por unidade não aceita fração"), "error");
      return;
    }
    setItems([
      ...items.filter((i) => i.product.id !== product.id),
      { product, quantity },
    ]);
    setProduct(null);
    setAmount("");
  };
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography fontWeight={700} mb={0.5}>
        {loss ? tr("Registrar perda") : tr("Registrar consumo interno")}
      </Typography>
      <Typography color="text.secondary" fontSize={13} mb={2}>
        {loss
          ? tr(
              "Produto que venceu, estragou ou quebrou e foi descartado. Sai do estoque pelo custo, como prejuízo.",
            )
          : tr(
              "O que a própria loja ou a família usou do estoque, incluindo sacolas e embalagens. Sai pelo custo, não é venda.",
            )}
      </Typography>
      <Stack direction="row" gap={1} mb={1.5} flexWrap="wrap">
        <ProductPicker value={product} onChange={setProduct} />
        <TextField
          label={tr("Quantidade")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          sx={{ width: 110 }}
        />
        <Button variant="outlined" onClick={add} disabled={!product}>
          {tr("Adicionar")}
        </Button>
      </Stack>
      {items.map((i) => (
        <Stack key={i.product.id} direction="row" alignItems="center" py={0.4}>
          <Typography fontSize={14} flex={1}>
            {qty(i.quantity)} {i.product.unit} × {i.product.name}
          </Typography>
          <Typography fontSize={13} color="text.secondary" mr={1}>
            {money(Number(i.product.cost) * i.quantity)}
          </Typography>
          <IconButton
            size="small"
            onClick={() =>
              setItems(items.filter((x) => x.product.id !== i.product.id))
            }
          >
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Stack gap={1.5} mt={1.5}>
        <TextField
          select
          label={tr("Motivo")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {reasons.map((r) => (
            <MenuItem key={r} value={r}>
              {r}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={tr("Observação (opcional)")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          inputProps={{ maxLength: 255 }}
        />
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography flex={1} fontWeight={650}>
            {tr("Custo total")}: {money(total)}
          </Typography>
          <Button
            variant="contained"
            color={loss ? "error" : "primary"}
            disabled={!items.length || !reason || isLoading}
            onClick={async () => {
              try {
                await send({
                  url: "/writeoffs",
                  method: "POST",
                  body: {
                    kind,
                    reason,
                    note,
                    items: items.map((i) => ({
                      productId: i.product.id,
                      quantity: i.quantity,
                    })),
                  },
                }).unwrap();
                notice(
                  loss ? tr("Perda registrada") : tr("Consumo registrado"),
                );
                setItems([]);
                setNote("");
              } catch (e) {
                notice(errorMessage(e), "error");
              }
            }}
          >
            {tr("Registrar")}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function Inventory() {
  const counts = useData<
    {
      id: number;
      productName: string;
      unit: string;
      previous: number;
      counted: number;
      difference: number;
      costImpact: number;
      reason: string;
      createdAt: string;
      username: string;
    }[]
  >("/inventory-counts");
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {tr(
          "Para contar um produto, use Produtos → Movimentar → Ajustar para quantidade final. Cada contagem fica registrada aqui com a diferença.",
        )}
      </Alert>
      <Failure error={counts.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Data")}</TableCell>
              <TableCell>{tr("Produto")}</TableCell>
              <TableCell align="right">{tr("Sistema")}</TableCell>
              <TableCell align="right">{tr("Contado")}</TableCell>
              <TableCell align="right">{tr("Diferença")}</TableCell>
              <TableCell align="right">{tr("Impacto no custo")}</TableCell>
              <TableCell>{tr("Motivo")}</TableCell>
              <TableCell>{tr("Operador")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {counts.data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{dateTime(c.createdAt)}</TableCell>
                <TableCell>{c.productName}</TableCell>
                <TableCell align="right">{qty(c.previous)}</TableCell>
                <TableCell align="right">{qty(c.counted)}</TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color:
                      Number(c.difference) < 0
                        ? "error.main"
                        : Number(c.difference) > 0
                          ? "info.main"
                          : undefined,
                  }}
                >
                  {Number(c.difference) > 0 ? "+" : ""}
                  {qty(c.difference)} {c.unit}
                </TableCell>
                <TableCell align="right">{money(c.costImpact)}</TableCell>
                <TableCell>{c.reason}</TableCell>
                <TableCell>{c.username}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {counts.isLoading && <Loading />}
        {!counts.isLoading && !counts.data?.length && (
          <Alert severity="info">{tr("Nenhuma contagem registrada.")}</Alert>
        )}
      </Paper>
    </>
  );
}
