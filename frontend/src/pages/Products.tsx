import { tr } from "../i18n";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Tab,
  Tabs,
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
  SearchRounded,
  EditRounded,
  DeleteOutlineRounded,
  SwapVertRounded,
  DownloadRounded,
  UploadRounded,
} from "@mui/icons-material";
import { useAppSelector, useData, useSendMutation } from "../store";
import type { Category, Page, Product } from "../types";
import { errorMessage, money, qty } from "../utils";
import {
  Field,
  FormDialog,
  Heading,
  Failure,
  Loading,
  useDebounce,
  useNotice,
} from "../components/Common";
import { download } from "../services/download";
export default function Products() {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const query = useDebounce(search);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<Product | "new" | null>(null);
  const [stock, setStock] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | "new" | null>(null);
  const [promotion, setPromotion] = useState(false);
  const [history, setHistory] = useState<Product | null>(null);
  const manager = useAppSelector((s) => s.auth?.role !== "CASHIER");
  const [send, { isLoading: busy }] = useSendMutation();
  const notice = useNotice();
  const products = useData<Page<Product>>(
    "/products?q=" + encodeURIComponent(query) + "&page=" + page,
  );
  const categories = useData<Category[]>("/categories");
  const rules = useData<
    {
      id: number;
      product: Product;
      tableName: string;
      price: number;
      startsAt: string;
      endsAt: string;
    }[]
  >("/price-rules");
  const movements = useData<
    Page<{
      id: number;
      createdAt: string;
      type: string;
      quantity: number;
      reason: string;
    }>
  >("/stock-movements?productId=" + history?.id, !history);
  const prices = useData<
    {
      id: number;
      previous: number;
      current: number;
      createdAt: string;
      username: string;
    }[]
  >("/products/" + history?.id + "/price-history", !history);
  const fields: Field[] = [
    { key: "name", label: tr("Nome do produto"), required: true },
    { key: "code", label: tr("Código interno"), required: true },
    { key: "barcode", label: tr("Código de barras (opcional)") },
    {
      key: "categoryId",
      label: tr("Categoria"),
      options: [
        { value: "", label: tr("Sem categoria") },
        ...(categories.data || []).map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    {
      key: "unit",
      label: tr("Unidade"),
      required: true,
      options: [
        { value: "UN", label: tr("Unidade (UN)") },
        { value: "KG", label: tr("Quilograma (KG)") },
      ],
    },
    {
      key: "price",
      label: tr("Preço de venda (R$)"),
      type: "number",
      required: true,
      min: 0,
      step: 0.01,
    },
    {
      key: "cost",
      label: tr("Custo (R$)"),
      type: "number",
      required: true,
      min: 0,
      step: 0.01,
    },
    {
      key: "minimumStock",
      label: tr("Estoque mínimo"),
      type: "number",
      required: true,
      min: 0,
      step: 0.001,
    },
    {
      key: "expiresOn",
      label: tr("Validade"),
      type: "date",
      helper: tr(
        "Com lotes cadastrados, vale a validade do lote que vence primeiro.",
      ),
    },
    {
      key: "perishable",
      label: tr("Perecível"),
      options: [
        { value: "false", label: tr("Não") },
        { value: "true", label: tr("Sim: exige validade na entrada") },
      ],
    },
  ];
  const mutate = async (url: string, method: string, body?: unknown) => {
    try {
      return await send({ url, method, body }).unwrap();
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };
  const archive = async (path: string) => {
    if (!window.confirm("Confirma a exclusão ou arquivamento deste registro?"))
      return;
    try {
      await mutate(path, "DELETE");
      notice(tr("Registro removido"));
    } catch (e) {
      notice(errorMessage(e), "error");
    }
  };
  return (
    <>
      <Heading
        title={tr("Produtos e estoque")}
        subtitle={tr("Catálogo organizado, prateleiras sempre abastecidas.")}
        action={
          manager ? (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setForm("new")}
            >
              {tr("Novo produto")}
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label={tr("Produtos")} />
        <Tab label={tr("Categorias")} />
        <Tab label={tr("Preços e promoções")} />
      </Tabs>
      {tab === 0 && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" gap={1.5} flexWrap="wrap">
              <TextField
                sx={{ flex: 1, minWidth: 230 }}
                placeholder={tr("Nome, código ou código de barras")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                startIcon={<DownloadRounded />}
                title={tr(
                  "Tabela de preços por categoria, com promoções do dia",
                )}
                onClick={async () => {
                  try {
                    await download("/products/catalog", "catalogo-precos.xlsx");
                  } catch {
                    notice(tr("Falha ao exportar"), "error");
                  }
                }}
              >
                {tr("Catálogo de preços")}
              </Button>
              {manager && (
                <>
                  <Button
                    startIcon={<DownloadRounded />}
                    onClick={async () => {
                      try {
                        await download(
                          "/products/export?format=xlsx",
                          "produtos.xlsx",
                        );
                      } catch {
                        notice(tr("Falha ao exportar"), "error");
                      }
                    }}
                  >
                    {tr("Excel")}
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        await download(
                          "/products/export?format=csv",
                          "produtos.csv",
                        );
                      } catch {
                        notice(tr("Falha ao exportar"), "error");
                      }
                    }}
                  >
                    {tr("CSV")}
                  </Button>
                  <Button
                    component="label"
                    startIcon={<UploadRounded />}
                    disabled={busy}
                  >
                    {tr("Importar")}
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const body = new FormData();
                        body.append("file", file);
                        try {
                          const result = (await mutate(
                            "/products/import",
                            "POST",
                            body,
                          )) as { imported: number };
                          notice(result.imported + " produtos importados");
                        } catch (err) {
                          notice(errorMessage(err), "error");
                        }
                        e.target.value = "";
                      }}
                    />
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
          <Failure error={products.error} />
          {products.isLoading ? (
            <Loading />
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <Box sx={{ overflowX: "auto" }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {[
                        tr("Produto"),
                        tr("Categoria"),
                        tr("Preço"),
                        tr("Estoque"),
                        tr("Validade"),
                        "",
                      ].map((h, i) => (
                        <TableCell key={i}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {products.data?.content.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Typography fontSize={14} fontWeight={650}>
                            {p.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            #{p.code} {p.barcode ? "• " + p.barcode : ""}
                          </Typography>
                        </TableCell>
                        <TableCell>{p.categoryName || "—"}</TableCell>
                        <TableCell sx={{ fontWeight: 650 }}>
                          {money(p.price)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={
                              Number(p.quantity) <= Number(p.minimumStock)
                                ? "warning"
                                : "default"
                            }
                            label={qty(p.quantity) + " " + p.unit}
                          />
                        </TableCell>
                        <TableCell>
                          {p.expiresOn?.split("-").reverse().join("/") || "—"}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <Button size="small" onClick={() => setHistory(p)}>
                            {tr("Histórico")}
                          </Button>
                          {manager && (
                            <>
                              <IconButton
                                aria-label={"Movimentar " + p.name}
                                onClick={() => setStock(p)}
                              >
                                <SwapVertRounded fontSize="small" />
                              </IconButton>
                              <IconButton
                                aria-label={"Editar " + p.name}
                                onClick={() => setForm(p)}
                              >
                                <EditRounded fontSize="small" />
                              </IconButton>
                              <IconButton
                                aria-label={"Arquivar " + p.name}
                                onClick={() => archive("/products/" + p.id)}
                              >
                                <DeleteOutlineRounded fontSize="small" />
                              </IconButton>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!products.data?.content.length && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                          {tr("Nenhum produto encontrado.")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                p={2}
              >
                <Typography variant="caption">
                  {products.data?.totalElements || 0} produtos
                </Typography>
                <Pagination
                  count={products.data?.totalPages || 1}
                  page={page + 1}
                  onChange={(_, n) => setPage(n - 1)}
                  size="small"
                />
              </Stack>
            </Paper>
          )}
        </>
      )}
      {tab === 1 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          {manager && (
            <Button
              startIcon={<AddRounded />}
              onClick={() => setCategory("new")}
            >
              {tr("Nova categoria")}
            </Button>
          )}
          <Stack gap={1} mt={2}>
            {categories.data?.map((c) => (
              <Stack key={c.id} direction="row" alignItems="center">
                <Typography flex={1}>{c.name}</Typography>
                {manager && (
                  <>
                    <IconButton onClick={() => setCategory(c)}>
                      <EditRounded fontSize="small" />
                    </IconButton>
                    <IconButton onClick={() => archive("/categories/" + c.id)}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </>
                )}
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
      {tab === 2 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          {manager && (
            <Button
              startIcon={<AddRounded />}
              onClick={() => setPromotion(true)}
            >
              {tr("Nova regra de preço")}
            </Button>
          )}
          <Alert severity="info" sx={{ my: 2 }}>
            A regra ativa com início mais recente prevalece na tabela
            selecionada. Fora da vigência, vale o preço do cadastro.
          </Alert>
          {rules.data?.map((r) => (
            <Stack
              key={r.id}
              direction="row"
              alignItems="center"
              gap={2}
              py={1}
            >
              <Box flex={1}>
                <Typography fontWeight={650}>
                  {r.product.name} • {money(r.price)}
                </Typography>
                <Typography variant="caption">
                  {r.tableName} • {new Date(r.startsAt).toLocaleString()} até{" "}
                  {new Date(r.endsAt).toLocaleString()}
                </Typography>
              </Box>
              {manager && (
                <IconButton onClick={() => archive("/price-rules/" + r.id)}>
                  <DeleteOutlineRounded />
                </IconButton>
              )}
            </Stack>
          ))}
        </Paper>
      )}
      {form && (
        <FormDialog
          title={form === "new" ? tr("Novo produto") : tr("Editar produto")}
          fields={fields}
          initial={
            form === "new"
              ? {
                  unit: "UN",
                  price: 0,
                  cost: 0,
                  minimumStock: 0,
                  perishable: "false",
                }
              : (form as unknown as Record<string, unknown>)
          }
          onClose={() => setForm(null)}
          onSave={async (v) => {
            await mutate(
              "/products" + (form === "new" ? "" : "/" + form.id),
              form === "new" ? "POST" : "PUT",
              {
                ...v,
                categoryId: v.categoryId ? Number(v.categoryId) : null,
                expiresOn: v.expiresOn || null,
                perishable: v.perishable === "true",
                price: Number(v.price),
                cost: Number(v.cost),
                minimumStock: Number(v.minimumStock),
              },
            );
            notice(
              "Produto salvo. Utilize a movimentação para cadastrar estoque.",
            );
          }}
        />
      )}
      {stock && (
        <FormDialog
          title={"Movimentar • " + stock.name}
          fields={[
            {
              key: "type",
              label: tr("Movimento"),
              options: [
                { value: "IN", label: tr("Entrada") },
                { value: "OUT", label: tr("Saída") },
                {
                  value: "ADJUSTMENT",
                  label: tr("Ajustar para quantidade final"),
                },
              ],
              required: true,
            },
            {
              key: "quantity",
              label: tr("Quantidade"),
              type: "number",
              min: 0,
              step: stock.unit === "KG" ? 0.001 : 1,
              required: true,
            },
            { key: "reason", label: tr("Motivo"), required: true },
            {
              key: "expiresOn",
              label: tr("Validade do lote (entradas)"),
              type: "date",
              helper: stock.perishable
                ? tr("Obrigatória: produto perecível")
                : tr("Opcional: cria um lote com validade"),
            },
            {
              key: "unitCost",
              label: tr("Custo unitário da entrada (R$)"),
              type: "number",
              min: 0,
              step: 0.01,
              helper: tr("Opcional: atualiza o custo médio"),
            },
          ]}
          initial={{ type: "IN" }}
          onClose={() => setStock(null)}
          onSave={async (v) => {
            await mutate("/stock-movements", "POST", {
              ...v,
              productId: stock.id,
              quantity: Number(v.quantity),
              expiresOn: v.expiresOn || null,
              unitCost: v.unitCost === "" ? null : Number(v.unitCost),
            });
            notice(tr("Estoque atualizado"));
          }}
        />
      )}
      {category && (
        <FormDialog
          title={tr("Categoria")}
          fields={[{ key: "name", label: tr("Nome"), required: true }]}
          initial={category === "new" ? {} : { name: category.name }}
          onClose={() => setCategory(null)}
          onSave={async (v) => {
            await mutate(
              "/categories" + (category === "new" ? "" : "/" + category.id),
              category === "new" ? "POST" : "PUT",
              v,
            );
            notice(tr("Categoria salva"));
          }}
        />
      )}
      {promotion && (
        <FormDialog
          title={tr("Preço promocional")}
          fields={[
            {
              key: "productId",
              label: tr("ID do produto (consulte o cadastro)"),
              type: "number",
              required: true,
              min: 1,
              step: 1,
            },
            { key: "tableName", label: tr("Tabela"), required: true },
            {
              key: "price",
              label: tr("Preço (R$)"),
              type: "number",
              required: true,
              min: 0,
              step: 0.01,
            },
            {
              key: "startsAt",
              label: tr("Início"),
              type: "datetime-local",
              required: true,
            },
            {
              key: "endsAt",
              label: tr("Fim"),
              type: "datetime-local",
              required: true,
            },
          ]}
          initial={{ tableName: "RETAIL" }}
          onClose={() => setPromotion(false)}
          onSave={async (v) => {
            await mutate("/price-rules", "POST", {
              ...v,
              productId: Number(v.productId),
              price: Number(v.price),
              startsAt: new Date(v.startsAt).toISOString(),
              endsAt: new Date(v.endsAt).toISOString(),
            });
            notice(tr("Promoção criada"));
          }}
        />
      )}
      <Dialog
        open={!!history}
        onClose={() => setHistory(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Movimentações • {history?.name}</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            {movements.data?.content.map((m) => (
              <Box key={m.id}>
                <Typography>
                  {m.type}: {qty(m.quantity)} • {m.reason}
                </Typography>
                <Typography variant="caption">
                  {new Date(m.createdAt).toLocaleString()}
                </Typography>
              </Box>
            ))}
            {!movements.data?.content.length && (
              <Typography>{tr("Nenhuma movimentação registrada.")}</Typography>
            )}
            {!!prices.data?.length && (
              <>
                <Typography fontWeight={700} mt={1}>
                  {tr("Histórico de preços")}
                </Typography>
                {prices.data.map((p) => (
                  <Box key={p.id}>
                    <Typography>
                      {money(p.previous)} → {money(p.current)}
                    </Typography>
                    <Typography variant="caption">
                      {new Date(p.createdAt).toLocaleString()} • {p.username}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
