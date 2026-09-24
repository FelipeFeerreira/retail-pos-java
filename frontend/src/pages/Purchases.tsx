import { tr } from "../i18n";
import { Fragment, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
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
  FactoryRounded,
} from "@mui/icons-material";
import { useData, useSendMutation } from "../store";
import type { Category, Product } from "../types";
import {
  errorMessage,
  money,
  qty,
  Rounding,
  suggestPrice,
  today,
} from "../utils";
import {
  Failure,
  FormDialog,
  Heading,
  Loading,
  useNotice,
} from "../components/Common";
import { ProductPicker } from "./Stock";

interface Supplier {
  id: number;
  name: string;
  document: string | null;
  phone: string | null;
}
interface Line {
  product: Product;
  quantity: number;
  unitCost: number;
  expiresOn: string;
  newPrice: string;
}
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR");
const date = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const inDays = (days: number) => {
  const d = new Date(today() + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );

/** Store pricing settings: default markup, rounding, card fee and markup per category. */
function usePricing() {
  const settings = useData<Record<string, string>>("/settings");
  const categories = useData<Category[]>("/categories");
  return useMemo(() => {
    const fallback = Number(settings.data?.["pricing.markup"] ?? 30);
    const rounding = (settings.data?.["pricing.rounding"] ??
      "ends9") as Rounding;
    const cardFee = Number(settings.data?.["fee.CREDIT"] ?? 0);
    const markupOf = (categoryId: number | null) => {
      const category = categories.data?.find((c) => c.id === categoryId);
      return category?.markup != null ? Number(category.markup) : fallback;
    };
    return { fallback, rounding, cardFee, markupOf };
  }, [settings.data, categories.data]);
}

export default function Purchases() {
  const [tab, setTab] = useState(0);
  return (
    <>
      <Heading
        title={tr("Compras e produção")}
        subtitle={tr(
          "Receba mercadoria, acompanhe o custo e produza seus próprios itens.",
        )}
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3 }}
        variant="scrollable"
      >
        <Tab label={tr("Receber mercadoria")} />
        <Tab label={tr("Compras recebidas")} />
        <Tab label={tr("Fornecedores")} />
        <Tab label={tr("Produção própria")} />
        <Tab label={tr("Margens e preços")} />
      </Tabs>
      {tab === 0 && <Receive onDone={() => setTab(1)} />}
      {tab === 1 && <History />}
      {tab === 2 && <Suppliers />}
      {tab === 3 && <Production />}
      {tab === 4 && <Margins />}
    </>
  );
}

function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier?: Supplier;
  onClose: () => void;
  onSaved?: (s: Supplier) => void;
}) {
  const [send] = useSendMutation();
  return (
    <FormDialog
      title={supplier ? tr("Editar fornecedor") : tr("Novo fornecedor")}
      fields={[
        { key: "name", label: tr("Nome"), required: true },
        { key: "document", label: tr("CNPJ/CPF (opcional)") },
        { key: "phone", label: tr("Telefone (opcional)") },
      ]}
      initial={supplier as unknown as Record<string, unknown>}
      onClose={onClose}
      onSave={async (v) => {
        try {
          const saved = (await send({
            url: "/suppliers" + (supplier ? "/" + supplier.id : ""),
            method: supplier ? "PUT" : "POST",
            body: v,
          }).unwrap()) as Supplier;
          onSaved?.(saved);
        } catch (e) {
          throw new Error(errorMessage(e));
        }
      }}
    />
  );
}

function Receive({ onDone }: { onDone: () => void }) {
  const pricing = usePricing();
  const suppliers = useData<Supplier[]>("/suppliers");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [newSupplier, setNewSupplier] = useState(false);
  const [document, setDocument] = useState("");
  const [dueDate, setDueDate] = useState(inDays(28));
  const [payment, setPayment] = useState("TERM");
  const [lines, setLines] = useState<Line[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [costMode, setCostMode] = useState<"unit" | "total">("unit");
  const [expiresOn, setExpiresOn] = useState("");
  const [requestId, setRequestId] = useState(uuid);
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const total = lines.reduce(
    (sum, l) => sum + Math.round(l.quantity * l.unitCost * 100) / 100,
    0,
  );
  const add = () => {
    const quantity = Number(amount.replace(",", "."));
    const value = Number(cost.replace(",", "."));
    if (!product || !(quantity > 0) || !(value >= 0)) return;
    if (product.unit === "UN" && !Number.isInteger(quantity)) {
      notice(tr("Produto vendido por unidade não aceita fração"), "error");
      return;
    }
    if (product.perishable && !expiresOn) {
      notice(tr("Informe a validade: produto perecível"), "error");
      return;
    }
    const unitCost =
      costMode === "total"
        ? Math.round((value / quantity) * 10000) / 10000
        : value;
    const suggested = suggestPrice(
      unitCost,
      pricing.markupOf(product.categoryId),
      pricing.rounding,
    ).price;
    setLines([
      ...lines.filter((l) => l.product.id !== product.id),
      {
        product,
        quantity,
        unitCost,
        expiresOn,
        newPrice: suggested > Number(product.price) ? suggested.toFixed(2) : "",
      },
    ]);
    setProduct(null);
    setAmount("");
    setCost("");
    setExpiresOn("");
  };
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 340px" },
        gap: 2,
        alignItems: "start",
      }}
    >
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={1.5}>
          {tr("Itens da nota")}
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
          <ProductPicker value={product} onChange={setProduct} />
          <TextField
            label={tr("Qtd")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ width: 90 }}
          />
          <TextField
            select
            value={costMode}
            onChange={(e) => setCostMode(e.target.value as "unit" | "total")}
            sx={{ width: 130 }}
          >
            <MenuItem value="unit">{tr("Custo unit.")}</MenuItem>
            <MenuItem value="total">{tr("Total pago")}</MenuItem>
          </TextField>
          <TextField
            label="R$"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            sx={{ width: 100 }}
          />
          <TextField
            label={tr("Validade")}
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText={product?.perishable ? tr("Obrigatória") : " "}
            sx={{ width: 160 }}
          />
          <Button variant="outlined" onClick={add} disabled={!product}>
            {tr("Adicionar")}
          </Button>
        </Stack>
        {lines.length > 0 && (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Produto")}</TableCell>
                  <TableCell align="right">{tr("Qtd")}</TableCell>
                  <TableCell align="right">{tr("Custo unit.")}</TableCell>
                  <TableCell align="right">{tr("Subtotal")}</TableCell>
                  <TableCell>{tr("Validade")}</TableCell>
                  <TableCell align="right">{tr("Preço atual")}</TableCell>
                  <TableCell>{tr("Novo preço")}</TableCell>
                  <TableCell>{tr("Lucro na venda")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((l, index) => {
                  const markup = pricing.markupOf(l.product.categoryId);
                  const suggested = suggestPrice(
                    l.unitCost,
                    markup,
                    pricing.rounding,
                  ).price;
                  const price = l.newPrice
                    ? Number(l.newPrice)
                    : Number(l.product.price);
                  const profit = price
                    ? ((price - l.unitCost) / price) * 100
                    : 0;
                  return (
                    <TableRow key={l.product.id}>
                      <TableCell>{l.product.name}</TableCell>
                      <TableCell align="right">
                        {qty(l.quantity)} {l.product.unit}
                      </TableCell>
                      <TableCell align="right">{money(l.unitCost)}</TableCell>
                      <TableCell align="right">
                        {money(l.quantity * l.unitCost)}
                      </TableCell>
                      <TableCell>{date(l.expiresOn || null)}</TableCell>
                      <TableCell align="right">
                        {money(l.product.price)}
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={l.newPrice}
                          placeholder={tr("manter")}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, i) =>
                                i === index
                                  ? { ...x, newPrice: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          helperText={`${tr("sugerido")} ${money(suggested)} (${markup}%)`}
                          sx={{ width: 130 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={
                            price <= l.unitCost
                              ? "error"
                              : profit < 15
                                ? "warning"
                                : "success"
                          }
                          label={
                            price <= l.unitCost
                              ? tr("PREJUÍZO")
                              : profit.toFixed(1) + "%"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() =>
                            setLines(lines.filter((_, i) => i !== index))
                          }
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
        {!lines.length && (
          <Typography color="text.secondary" fontSize={14}>
            {tr(
              "Adicione os produtos da nota. Informe o custo unitário ou o total pago na linha; o sistema calcula o custo médio e sugere o preço pela margem da categoria.",
            )}
          </Typography>
        )}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={1.5}>
          {tr("Dados da nota")}
        </Typography>
        <Stack gap={1.5}>
          <Stack direction="row" gap={1}>
            <Autocomplete
              options={suppliers.data || []}
              value={supplier}
              onChange={(_, s) => setSupplier(s)}
              getOptionLabel={(s) => s.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label={tr("Fornecedor")} />
              )}
              sx={{ flex: 1 }}
            />
            <IconButton
              title={tr("Novo fornecedor")}
              onClick={() => setNewSupplier(true)}
            >
              <AddRounded />
            </IconButton>
          </Stack>
          <TextField
            label={tr("Número da nota / documento")}
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
          <TextField
            select
            label={tr("Pagamento")}
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          >
            <MenuItem value="TERM">{tr("A prazo (boleto)")}</MenuItem>
            <MenuItem value="CASH">{tr("À vista")}</MenuItem>
          </TextField>
          <TextField
            label={tr("Vencimento")}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" justifyContent="space-between" mt={1}>
            <Typography fontWeight={650}>{tr("Total da nota")}</Typography>
            <Typography variant="h5" color="primary" fontWeight={800}>
              {money(total)}
            </Typography>
          </Stack>
          <Button
            variant="contained"
            size="large"
            disabled={
              !supplier || !document.trim() || !lines.length || isLoading
            }
            onClick={async () => {
              try {
                await send({
                  url: "/purchases",
                  method: "POST",
                  body: {
                    requestId,
                    supplierId: supplier!.id,
                    document,
                    dueDate,
                    payment,
                    items: lines.map((l) => ({
                      productId: l.product.id,
                      quantity: l.quantity,
                      unitCost: l.unitCost,
                      expiresOn: l.expiresOn || null,
                      newPrice: l.newPrice ? Number(l.newPrice) : null,
                    })),
                  },
                }).unwrap();
                notice(
                  tr("Mercadoria recebida. Estoque e custos atualizados."),
                );
                setLines([]);
                setDocument("");
                setRequestId(uuid());
                onDone();
              } catch (e) {
                notice(errorMessage(e), "error");
              }
            }}
          >
            {tr("Receber mercadoria")}
          </Button>
        </Stack>
      </Paper>
      {newSupplier && (
        <SupplierDialog
          onClose={() => setNewSupplier(false)}
          onSaved={setSupplier}
        />
      )}
    </Box>
  );
}

interface PurchaseRow {
  id: number;
  document: string;
  supplier: string;
  dueDate: string;
  payment: string;
  total: number;
  createdAt: string;
  username: string;
  items: number;
}
function History() {
  const list = useData<PurchaseRow[]>("/purchases");
  const [open, setOpen] = useState<number | null>(null);
  const detail = useData<
    PurchaseRow & {
      items: {
        id: number;
        productName: string;
        unit: string;
        quantity: number;
        unitCost: number;
        total: number;
        expiresOn: string | null;
        newPrice: number | null;
      }[];
    }
  >("/purchases/" + open, open === null);
  return (
    <>
      <Failure error={list.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>{tr("Data")}</TableCell>
              <TableCell>{tr("Fornecedor")}</TableCell>
              <TableCell>{tr("Documento")}</TableCell>
              <TableCell>{tr("Pagamento")}</TableCell>
              <TableCell>{tr("Vencimento")}</TableCell>
              <TableCell align="right">{tr("Itens")}</TableCell>
              <TableCell align="right">{tr("Total")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.data?.map((p) => (
              <Fragment key={p.id}>
                <TableRow
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                >
                  <TableCell>{p.id}</TableCell>
                  <TableCell>{dateTime(p.createdAt)}</TableCell>
                  <TableCell>{p.supplier}</TableCell>
                  <TableCell>{p.document}</TableCell>
                  <TableCell>
                    {p.payment === "CASH" ? tr("À vista") : tr("A prazo")}
                  </TableCell>
                  <TableCell>{date(p.dueDate)}</TableCell>
                  <TableCell align="right">{p.items}</TableCell>
                  <TableCell align="right">{money(p.total)}</TableCell>
                </TableRow>
                {open === p.id && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ bgcolor: "action.hover" }}>
                      {!detail.data && <Loading />}
                      {detail.data?.items.map((i) => (
                        <Typography key={i.id} fontSize={13}>
                          {qty(i.quantity)} {i.unit} × {i.productName} ×{" "}
                          {money(i.unitCost)} = {money(i.total)}
                          {i.expiresOn &&
                            ` • ${tr("vence")} ${date(i.expiresOn)}`}
                          {i.newPrice != null &&
                            ` • ${tr("novo preço")} ${money(i.newPrice)}`}
                        </Typography>
                      ))}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {list.isLoading && <Loading />}
        {!list.isLoading && !list.data?.length && (
          <Alert severity="info">{tr("Nenhuma compra recebida ainda.")}</Alert>
        )}
      </Paper>
    </>
  );
}

function Suppliers() {
  const list = useData<Supplier[]>("/suppliers");
  const [form, setForm] = useState<Supplier | "new" | null>(null);
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Button startIcon={<AddRounded />} onClick={() => setForm("new")}>
        {tr("Novo fornecedor")}
      </Button>
      <Failure error={list.error} />
      <Stack mt={1.5}>
        {list.data?.map((s) => (
          <Stack
            key={s.id}
            direction="row"
            alignItems="center"
            py={1}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Box flex={1}>
              <Typography fontWeight={650}>{s.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[s.document, s.phone].filter(Boolean).join(" • ") || "—"}
              </Typography>
            </Box>
            <IconButton onClick={() => setForm(s)}>
              <EditRounded fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      {form && (
        <SupplierDialog
          supplier={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </Paper>
  );
}

interface Recipe {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  yield: number;
  note: string;
  price: number;
  batchCost: number;
  unitCost: number;
  items: {
    inputId: number;
    inputName: string;
    unit: string;
    quantity: number;
    cost: number;
    stock: number;
  }[];
}
function Production() {
  const recipes = useData<Recipe[]>("/recipes");
  const productions = useData<
    {
      id: number;
      productName: string;
      unit: string;
      multiplier: number;
      produced: number;
      expiresOn: string;
      totalCost: number;
      unitCost: number;
      note: string;
      createdAt: string;
      username: string;
      inputs: { productName: string; unit: string; quantity: number }[];
    }[]
  >("/productions");
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const [producing, setProducing] = useState<Recipe | null>(null);
  const [send] = useSendMutation();
  const notice = useNotice();
  return (
    <>
      <Stack direction="row" mb={2}>
        <Typography fontWeight={700} flex={1}>
          {tr("Receitas")}
        </Typography>
        <Button startIcon={<AddRounded />} onClick={() => setEditing("new")}>
          {tr("Nova receita")}
        </Button>
      </Stack>
      <Failure error={recipes.error} />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2,1fr)",
            xl: "repeat(3,1fr)",
          },
          gap: 2,
        }}
      >
        {recipes.data?.map((r) => {
          const margin = r.price ? ((r.price - r.unitCost) / r.price) * 100 : 0;
          return (
            <Paper key={r.id} variant="outlined" sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" mb={1}>
                <Typography fontWeight={750} flex={1}>
                  {r.productName}
                </Typography>
                <IconButton size="small" onClick={() => setEditing(r)}>
                  <EditRounded fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={async () => {
                    if (!window.confirm(tr("Arquivar esta receita?"))) return;
                    try {
                      await send({
                        url: "/recipes/" + r.id,
                        method: "DELETE",
                      }).unwrap();
                    } catch (e) {
                      notice(errorMessage(e), "error");
                    }
                  }}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Stack>
              <Typography fontSize={13} color="text.secondary" mb={1}>
                {tr("Rende")} {qty(r.yield)} {r.unit} • {tr("custo do lote")}{" "}
                {money(r.batchCost)} • {money(r.unitCost)}/{r.unit}
              </Typography>
              {r.items.map((i) => (
                <Typography key={i.inputId} fontSize={13}>
                  {qty(i.quantity)} {i.unit} {i.inputName}
                  <Typography
                    component="span"
                    fontSize={12}
                    color="text.secondary"
                  >
                    {" "}
                    ({tr("estoque")} {qty(i.stock)})
                  </Typography>
                </Typography>
              ))}
              <Stack direction="row" alignItems="center" mt={1.5}>
                <Chip
                  size="small"
                  variant="outlined"
                  color={
                    margin <= 0 ? "error" : margin < 20 ? "warning" : "success"
                  }
                  label={`${tr("Venda")} ${money(r.price)} • ${tr("lucro")} ${margin.toFixed(0)}%`}
                />
                <Box flex={1} />
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FactoryRounded />}
                  onClick={() => setProducing(r)}
                >
                  {tr("Produzir")}
                </Button>
              </Stack>
            </Paper>
          );
        })}
      </Box>
      {!recipes.isLoading && !recipes.data?.length && (
        <Alert severity="info">
          {tr(
            "Cadastre uma receita para pães, salgados e doces: o produto final, quanto rende e os insumos usados.",
          )}
        </Alert>
      )}
      <Typography fontWeight={700} mt={4} mb={1.5}>
        {tr("Lotes produzidos")}
      </Typography>
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tr("Data")}</TableCell>
              <TableCell>{tr("Produto")}</TableCell>
              <TableCell align="right">{tr("Produzido")}</TableCell>
              <TableCell>{tr("Validade")}</TableCell>
              <TableCell>{tr("Insumos")}</TableCell>
              <TableCell align="right">{tr("Custo")}</TableCell>
              <TableCell align="right">{tr("Custo unit.")}</TableCell>
              <TableCell>{tr("Responsável")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {productions.data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{dateTime(p.createdAt)}</TableCell>
                <TableCell>{p.productName}</TableCell>
                <TableCell align="right">
                  {qty(p.produced)} {p.unit}
                </TableCell>
                <TableCell>{date(p.expiresOn)}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>
                  {p.inputs
                    .map((i) => `${qty(i.quantity)} ${i.unit} ${i.productName}`)
                    .join(", ")}
                </TableCell>
                <TableCell align="right">{money(p.totalCost)}</TableCell>
                <TableCell align="right">{money(p.unitCost)}</TableCell>
                <TableCell>{p.username}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!productions.isLoading && !productions.data?.length && (
          <Alert severity="info">{tr("Nenhuma produção registrada.")}</Alert>
        )}
      </Paper>
      {editing && (
        <RecipeDialog
          recipe={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {producing && (
        <FormDialog
          title={tr("Produzir") + " • " + producing.productName}
          fields={[
            {
              key: "multiplier",
              label: tr("Quantas receitas (lotes)?"),
              type: "number",
              required: true,
              min: 0.001,
              step: 0.001,
              helper: `1 ${tr("receita rende")} ${qty(producing.yield)} ${producing.unit}`,
            },
            {
              key: "actualYield",
              label: tr("Rendimento real (opcional)"),
              type: "number",
              min: 0.001,
              step: 0.001,
              helper: tr("Deixe vazio para usar o rendimento da receita"),
            },
            {
              key: "expiresOn",
              label: tr("Validade do lote"),
              type: "date",
              required: true,
            },
            { key: "note", label: tr("Observação") },
          ]}
          initial={{ multiplier: 1, expiresOn: inDays(2) }}
          onClose={() => setProducing(null)}
          onSave={async (v) => {
            try {
              const result = (await send({
                url: "/productions",
                method: "POST",
                body: {
                  recipeId: producing.id,
                  multiplier: Number(v.multiplier),
                  actualYield: v.actualYield ? Number(v.actualYield) : null,
                  expiresOn: v.expiresOn,
                  note: v.note,
                },
              }).unwrap()) as { produced: number; totalCost: number };
              notice(
                `${tr("Produzido")}: ${qty(result.produced)} ${producing.unit} • ${tr("custo")} ${money(result.totalCost)}`,
              );
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      )}
    </>
  );
}

function RecipeDialog({
  recipe,
  onClose,
}: {
  recipe?: Recipe;
  onClose: () => void;
}) {
  const [product, setProduct] = useState<Product | null>(
    recipe
      ? ({
          id: recipe.productId,
          name: recipe.productName,
          code: "",
          unit: recipe.unit,
        } as Product)
      : null,
  );
  const [yieldValue, setYieldValue] = useState(String(recipe?.yield ?? ""));
  const [note, setNote] = useState(recipe?.note ?? "");
  const [items, setItems] = useState<
    { id: number; name: string; unit: string; quantity: number }[]
  >(
    recipe?.items.map((i) => ({
      id: i.inputId,
      name: i.inputName,
      unit: i.unit,
      quantity: Number(i.quantity),
    })) ?? [],
  );
  const [input, setInput] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [send, { isLoading }] = useSendMutation();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {recipe ? tr("Editar receita") : tr("Nova receita")}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <ProductPicker
            value={product}
            onChange={setProduct}
            label={tr("Produto final (ex.: Pão francês)")}
          />
          <TextField
            label={tr("Rendimento de uma receita")}
            type="number"
            value={yieldValue}
            onChange={(e) => setYieldValue(e.target.value)}
            helperText={product ? tr("Na unidade do produto final") : " "}
          />
          <Typography fontWeight={650}>{tr("Insumos por receita")}</Typography>
          <Stack direction="row" gap={1}>
            <ProductPicker
              value={input}
              onChange={setInput}
              label={tr("Insumo")}
            />
            <TextField
              label={tr("Qtd")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              sx={{ width: 90 }}
            />
            <Button
              onClick={() => {
                const quantity = Number(amount.replace(",", "."));
                if (!input || !(quantity > 0)) return;
                setItems([
                  ...items.filter((i) => i.id !== input.id),
                  {
                    id: input.id,
                    name: input.name,
                    unit: input.unit,
                    quantity,
                  },
                ]);
                setInput(null);
                setAmount("");
              }}
            >
              {tr("Adicionar")}
            </Button>
          </Stack>
          {items.map((i) => (
            <Stack key={i.id} direction="row" alignItems="center">
              <Typography flex={1} fontSize={14}>
                {qty(i.quantity)} {i.unit} {i.name}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setItems(items.filter((x) => x.id !== i.id))}
              >
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <TextField
            label={tr("Observação")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr("Cancelar")}</Button>
        <Button
          variant="contained"
          disabled={
            !product || !Number(yieldValue) || !items.length || isLoading
          }
          onClick={async () => {
            setError("");
            try {
              await send({
                url: "/recipes" + (recipe ? "/" + recipe.id : ""),
                method: recipe ? "PUT" : "POST",
                body: {
                  productId: product!.id,
                  yield: Number(yieldValue),
                  note,
                  items: items.map((i) => ({
                    inputId: i.id,
                    quantity: i.quantity,
                  })),
                },
              }).unwrap();
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

function Margins() {
  const pricing = usePricing();
  const categories = useData<Category[]>("/categories");
  const [send] = useSendMutation();
  const notice = useNotice();
  const [cost, setCost] = useState("10");
  const save = async (url: string, method: string, body: unknown) => {
    try {
      await send({ url, method, body }).unwrap();
      notice(tr("Configuração salva"));
    } catch (e) {
      notice(errorMessage(e), "error");
    }
  };
  const example = suggestPrice(
    Number(cost.replace(",", ".")) || 0,
    pricing.fallback,
    pricing.rounding,
    pricing.cardFee,
  );
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) minmax(0,1fr)" },
        gap: 2,
        alignItems: "start",
      }}
    >
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={0.5}>
          {tr("Regra de preço")}
        </Typography>
        <Typography fontSize={13} color="text.secondary" mb={2}>
          {tr(
            "Preço sugerido = custo + margem % sobre o custo, sempre arredondado para cima.",
          )}
        </Typography>
        <Stack gap={2}>
          <TextField
            label={tr("Margem padrão (% sobre o custo)")}
            type="number"
            key={"m" + pricing.fallback}
            defaultValue={pricing.fallback}
            onBlur={(e) =>
              e.target.value !== String(pricing.fallback) &&
              save("/settings", "PUT", { "pricing.markup": e.target.value })
            }
            helperText={tr("Usada nas categorias sem margem própria")}
          />
          <TextField
            select
            label={tr("Arredondamento")}
            value={pricing.rounding}
            onChange={(e) =>
              save("/settings", "PUT", { "pricing.rounding": e.target.value })
            }
          >
            <MenuItem value="ends9">
              {tr("Terminar em 9 (7,29 / 12,99)")}
            </MenuItem>
            <MenuItem value="0.05">
              {tr("Para cima, de 5 em 5 centavos")}
            </MenuItem>
            <MenuItem value="0.10">
              {tr("Para cima, de 10 em 10 centavos")}
            </MenuItem>
            <MenuItem value="0.01">{tr("Centavo exato")}</MenuItem>
          </TextField>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
            <Stack direction="row" gap={1} alignItems="center" mb={1}>
              <Typography fontSize={14} flex={1}>
                {tr("Simular custo de")}
              </Typography>
              <TextField
                size="small"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                sx={{ width: 100 }}
              />
            </Stack>
            <Typography fontSize={14}>
              {tr("Vende a")} <b>{money(example.price)}</b> • {tr("lucro")}{" "}
              {money(example.profit)} ({example.profitPct.toFixed(1)}%{" "}
              {tr("da venda")}) • {tr("no crédito")}{" "}
              {example.cardProfitPct.toFixed(1)}%
            </Typography>
          </Paper>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography fontWeight={700} mb={1.5}>
          {tr("Margem por categoria")}
        </Typography>
        {categories.data?.map((c) => (
          <Stack
            key={c.id}
            direction="row"
            alignItems="center"
            py={0.7}
            gap={1}
          >
            <Typography flex={1} fontSize={14}>
              {c.name}
            </Typography>
            <TextField
              size="small"
              type="number"
              key={c.id + "-" + c.markup}
              defaultValue={c.markup ?? ""}
              placeholder={String(pricing.fallback)}
              onBlur={(e) => {
                const value =
                  e.target.value === "" ? null : Number(e.target.value);
                if (value === (c.markup == null ? null : Number(c.markup)))
                  return;
                void save("/categories/" + c.id, "PUT", {
                  name: c.name,
                  markup: value,
                });
              }}
              InputProps={{ endAdornment: "%" }}
              sx={{ width: 110 }}
            />
          </Stack>
        ))}
      </Paper>
    </Box>
  );
}
