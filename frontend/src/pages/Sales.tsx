import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
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
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
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
  RemoveRounded,
  DeleteOutlineRounded,
  SearchRounded,
  ShoppingBasketRounded,
  ScaleRounded,
  PrintRounded,
  CheckCircleRounded,
  HistoryRounded,
  TvRounded,
} from "@mui/icons-material";
import { useReactToPrint } from "react-to-print";
import { useTranslation } from "react-i18next";
import {
  add,
  api,
  cartTotal,
  change,
  clear,
  remove,
  useAppDispatch,
  useAppSelector,
  useData,
  useSendMutation,
} from "../store";
import type {
  CashSummary,
  Customer,
  Page,
  Product,
  Receipt,
  Sale,
} from "../types";
import { Link } from "react-router-dom";
import {
  errorMessage,
  hasQuantity,
  lineTotal,
  money,
  parseScan,
  qty,
} from "../utils";
import { Failure, Heading, useDebounce, useNotice } from "../components/Common";
import { publishDisplay } from "./CustomerDisplay";
import {
  connectAuthorizedScale,
  loadConfig as loadScaleConfig,
  readStableWeight,
  scaleStatus,
} from "../services/scale";
const METHODS = ["CASH", "CREDIT", "DEBIT", "PIX", "VOUCHER", "ACCOUNT"];
/** Pagamento em andamento ou concluído, mostrado ao cliente (valor pago, formas e troco). */
export interface PaymentView {
  payments: { method: string; amount: number }[];
  tender: number;
  change: number;
}

// Cores fixas do lado do cliente: alto contraste, independentes do tema claro/escuro.
const CUSTOMER_BG = "#0b1f18";
const CUSTOMER_TEXT = "#ffffff";
const CUSTOMER_SOFT = "#9fd4bf";
const CUSTOMER_ACCENT = "#5ee0a6";

export default function Sales() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const auth = useAppSelector((s) => s.auth);
  const manager = auth?.role !== "CASHIER";
  const notice = useNotice();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(parseScan(search).query);
  const [table, setTable] = useState("RETAIL");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomer = useDebounce(customerSearch);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // Só o recibo de uma venda recém-finalizada imprime sozinho.
  const [freshReceipt, setFreshReceipt] = useState(false);
  const [history, setHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  // Item selecionado (para cancelar, dar desconto ou mudar a quantidade) e o último registrado.
  const [selected, setSelected] = useState<number | null>(null);
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  // Pagamento em andamento e o resumo da venda que acabou de ser finalizada.
  const [paying, setPaying] = useState<PaymentView | null>(null);
  const [finished, setFinished] = useState<
    (PaymentView & { total: number }) | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const products = useData<Page<Product>>(
    "/products?q=" + encodeURIComponent(debounced) + "&size=8",
    !debounced,
  );
  const customers = useData<Page<Customer>>(
    "/customers?q=" + encodeURIComponent(debouncedCustomer),
  );
  const sales = useData<Page<Sale>>("/sales", !history);
  const drawer = useData<CashSummary | null>("/cash/current");
  const drawerClosed = !drawer.isLoading && !drawer.error && !drawer.data;
  const [send] = useSendMutation();
  const total = cartTotal(cart);
  const storeSettings = useData<Record<string, string>>("/settings");
  const storeName = storeSettings.data?.["store.name"] || "Meu Mercadinho";
  const selectedItem = cart.find((i) => i.product.id === selected) || null;
  const lastItem =
    cart.find((i) => i.product.id === lastAdded) || cart[cart.length - 1];
  const scale = useScaleStatus();

  // Espelha o carrinho na "Tela do cliente" em segunda janela, se estiver aberta.
  useEffect(() => {
    if (receipt) return;
    publishDisplay({
      store: storeName,
      total,
      items: cart.map((i) => ({
        name: i.product.name,
        unit: i.product.unit,
        quantity: i.quantity,
        total: lineTotal(i.product.price, i.quantity, i.discount) / 100,
      })),
      payment: paying ?? undefined,
    });
  }, [cart, total, storeName, receipt, paying]);

  // Mantém uma seleção válida: o último item registrado, se o selecionado sumir.
  useEffect(() => {
    if (!cart.length) setSelected(null);
    else if (!cart.some((i) => i.product.id === selected))
      setSelected(cart[cart.length - 1].product.id);
  }, [cart, selected]);

  const addProduct = async (product: Product, amount = 1, typed = false) => {
    if (adding) return;
    setAdding(true);
    try {
      // Produto por quilo sem quantidade digitada: o peso vem da balança.
      if (product.unit === "KG" && !typed && loadScaleConfig().mode !== "off") {
        notice(tr("Lendo balança…"), "info");
        amount = await readStableWeight();
      }
      if (amount <= 0 || !Number.isFinite(amount))
        throw new Error("Quantidade deve ser maior que zero");
      if (product.unit === "UN" && !Number.isInteger(amount))
        throw new Error("Produto vendido por unidade não aceita fração");
      const existing =
        cart.find((i) => i.product.id === product.id)?.quantity || 0;
      if (existing + amount > Number(product.quantity))
        throw new Error("Estoque insuficiente");
      const result = (await dispatch(
        api.endpoints.get.initiate(
          "/products/" +
            product.id +
            "/price?table=" +
            encodeURIComponent(table),
          { subscribe: false, forceRefetch: true },
        ),
      ).unwrap()) as { price: number };
      dispatch(
        add({
          product: { ...product, price: Number(result.price) },
          quantity: amount,
        }),
      );
      setFinished(null);
      setLastAdded(product.id);
      setSelected(product.id);
      setSearch("");
      inputRef.current?.focus();
    } catch (e) {
      notice(errorMessage(e), "error");
    } finally {
      setAdding(false);
    }
  };

  const cancelItem = () => {
    if (!selectedItem) return;
    if (
      !window.confirm(
        tr("Cancelar o item") + " " + selectedItem.product.name + "?",
      )
    )
      return;
    dispatch(remove(selectedItem.product.id));
    inputRef.current?.focus();
  };
  const cancelSale = () => {
    if (!cart.length) return;
    if (
      !window.confirm(tr("Cancelar a venda inteira? Os itens serão retirados."))
    )
      return;
    dispatch(clear());
    setCustomer(null);
    inputRef.current?.focus();
  };
  const canFinish =
    !drawerClosed &&
    cart.length > 0 &&
    total > 0 &&
    !cart.some(
      (i) =>
        i.quantity <= 0 ||
        i.discount < 0 ||
        lineTotal(i.product.price, i.quantity, i.discount) < 0 ||
        (i.product.unit === "UN" && !Number.isInteger(i.quantity)),
    );

  // Atalhos do operador. Del só cancela item quando não se está apagando texto num campo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (payOpen || receipt || discountOpen || history) return;
      const target = e.target as HTMLInputElement | null;
      const typing =
        !!target && target.tagName === "INPUT" && target.value !== "";
      if (e.key === "F2") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if ((e.key === "F9" || e.key === "F4") && canFinish) {
        e.preventDefault();
        setPayOpen(true);
      } else if (e.key === "F6" && selectedItem) {
        e.preventDefault();
        setDiscountOpen(true);
      } else if (e.key === "F7") {
        e.preventDefault();
        customerRef.current?.focus();
      } else if (e.key === "Delete" && !typing) {
        e.preventDefault();
        cancelItem();
      } else if (e.key === "Escape" && !typing) {
        e.preventDefault();
        cancelSale();
      } else if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !typing &&
        cart.length
      ) {
        // Setas mudam o item selecionado.
        e.preventDefault();
        const index = cart.findIndex((i) => i.product.id === selected);
        const next = Math.min(
          cart.length - 1,
          Math.max(0, index + (e.key === "ArrowUp" ? -1 : 1)),
        );
        setSelected(cart[next].product.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const scan = async () => {
    const parsed = parseScan(search);
    if (!parsed.query) return;
    try {
      const result = (await dispatch(
        api.endpoints.get.initiate(
          "/products?q=" + encodeURIComponent(parsed.query) + "&size=50",
          {
            subscribe: false,
            forceRefetch: true,
          },
        ),
      ).unwrap()) as Page<Product>;
      const product =
        result.content.find(
          (p) => p.code === parsed.query || p.barcode === parsed.query,
        ) || (result.content.length === 1 ? result.content[0] : null);
      if (product)
        await addProduct(product, parsed.quantity, hasQuantity(search));
      else
        notice(
          result.content.length
            ? tr("Selecione um dos produtos encontrados")
            : tr("Produto não encontrado"),
          "info",
        );
    } catch (e) {
      notice(errorMessage(e), "error");
    }
  };

  const shortcut = (
    key: string,
    label: string,
    onClick: () => void,
    disabled = false,
    color?: "error",
  ) => (
    <Button
      variant="outlined"
      color={color}
      disabled={disabled}
      onClick={onClick}
      sx={{ justifyContent: "flex-start", py: 1, fontSize: 13 }}
    >
      <Box
        component="span"
        sx={{
          mr: 1,
          px: 0.8,
          borderRadius: 1,
          fontSize: 11,
          fontWeight: 800,
          bgcolor: "action.selected",
        }}
      >
        {key}
      </Box>
      {label}
    </Button>
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0,1.5fr) minmax(330px,1fr)",
        },
        gap: 2,
        // Ocupa a altura da tela: 66 px da barra do topo e o espaçamento da página.
        height: { md: "calc(100vh - 66px - 56px)" },
        minHeight: 560,
      }}
    >
      {/* ---------------- LADO ESQUERDO: CLIENTE ---------------- */}
      <Paper
        sx={{
          bgcolor: CUSTOMER_BG,
          color: CUSTOMER_TEXT,
          borderRadius: 3,
          p: { xs: 2, md: 3 },
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Stack direction="row" alignItems="baseline" mb={1.5}>
          <Typography fontSize={22} fontWeight={800} flex={1} noWrap>
            {storeName}
          </Typography>
          <Typography fontSize={15} color={CUSTOMER_SOFT}>
            {customer ? customer.name : tr("Consumidor final")}
          </Typography>
        </Stack>
        {lastItem && !finished && (
          <Box
            sx={{
              bgcolor: "rgba(94,224,166,.14)",
              border: "2px solid " + CUSTOMER_ACCENT,
              borderRadius: 2,
              px: 2,
              py: 1.2,
              mb: 1.5,
            }}
          >
            <Typography fontSize={13} color={CUSTOMER_SOFT} fontWeight={700}>
              {tr("ÚLTIMO ITEM")}
            </Typography>
            <Stack direction="row" alignItems="baseline" gap={2}>
              <Typography fontSize={28} fontWeight={800} flex={1} noWrap>
                {lastItem.product.name}
              </Typography>
              <Typography
                fontSize={24}
                fontWeight={800}
                color={CUSTOMER_ACCENT}
              >
                {money(
                  lineTotal(
                    lastItem.product.price,
                    lastItem.quantity,
                    lastItem.discount,
                  ) / 100,
                )}
              </Typography>
            </Stack>
            <Typography fontSize={20} color={CUSTOMER_SOFT}>
              {qty(lastItem.quantity)} {lastItem.product.unit} ×{" "}
              {money(lastItem.product.price)}
              {lastItem.discount > 0 &&
                ` • ${tr("desconto")} ${money(lastItem.discount)}`}
            </Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {finished ? (
            <Stack
              alignItems="center"
              justifyContent="center"
              height="100%"
              gap={1}
            >
              <CheckCircleRounded
                sx={{ fontSize: 64, color: CUSTOMER_ACCENT }}
              />
              <Typography fontSize={34} fontWeight={800}>
                {tr("Obrigado pela preferência!")}
              </Typography>
            </Stack>
          ) : cart.length ? (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {[
                    tr("Item"),
                    tr("Qtd/Peso"),
                    tr("Unit."),
                    tr("Subtotal"),
                  ].map((h, i) => (
                    <TableCell
                      key={h}
                      align={i ? "right" : "left"}
                      sx={{
                        bgcolor: CUSTOMER_BG,
                        color: CUSTOMER_SOFT,
                        fontSize: 15,
                        borderColor: "rgba(255,255,255,.15)",
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {cart.map((item) => {
                  const active = item.product.id === selected;
                  const cell = {
                    color: CUSTOMER_TEXT,
                    fontSize: 22,
                    py: 1,
                    borderColor: "rgba(255,255,255,.12)",
                  };
                  return (
                    <TableRow
                      key={item.product.id}
                      onClick={() => setSelected(item.product.id)}
                      sx={{
                        cursor: "pointer",
                        bgcolor: active ? "rgba(255,255,255,.10)" : undefined,
                        outline: active
                          ? "2px solid " + CUSTOMER_SOFT
                          : undefined,
                      }}
                    >
                      <TableCell sx={cell}>{item.product.name}</TableCell>
                      <TableCell sx={cell} align="right">
                        {qty(item.quantity)} {item.product.unit}
                      </TableCell>
                      <TableCell
                        sx={{ ...cell, color: CUSTOMER_SOFT }}
                        align="right"
                      >
                        {money(item.product.price)}
                      </TableCell>
                      <TableCell
                        sx={{ ...cell, fontWeight: 700 }}
                        align="right"
                      >
                        {money(
                          lineTotal(
                            item.product.price,
                            item.quantity,
                            item.discount,
                          ) / 100,
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Stack
              alignItems="center"
              justifyContent="center"
              height="100%"
              color={CUSTOMER_SOFT}
            >
              <ShoppingBasketRounded sx={{ fontSize: 72, opacity: 0.5 }} />
              <Typography fontSize={28} fontWeight={700}>
                {tr("Caixa livre")}
              </Typography>
            </Stack>
          )}
        </Box>
        <Box sx={{ borderTop: "2px solid " + CUSTOMER_ACCENT, pt: 1.5, mt: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography fontSize={30} fontWeight={800}>
              {tr("TOTAL")}
            </Typography>
            <Typography
              data-testid="customer-total"
              sx={{ fontSize: { xs: 48, md: 72 }, lineHeight: 1.05 }}
              fontWeight={900}
              color={CUSTOMER_ACCENT}
            >
              {money(finished ? finished.total : total)}
            </Typography>
          </Stack>
          {(finished || paying) && (
            <PaymentSummary view={(finished || paying)!} t={t} />
          )}
        </Box>
      </Paper>

      {/* ---------------- LADO DIREITO: OPERADOR ---------------- */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Chip
            size="small"
            color={drawerClosed ? "error" : "success"}
            label={
              drawerClosed
                ? tr("Caixa fechado")
                : `${tr("Caixa")} #${drawer.data?.session.id ?? "…"} ${tr("aberto")}`
            }
          />
          <Chip
            size="small"
            variant="outlined"
            label={`${tr("Operador")}: ${auth?.username}`}
          />
          <ScaleChip status={scale} />
          <Box flex={1} />
          <IconButton
            size="small"
            title={tr("Tela do cliente")}
            onClick={() =>
              window.open(
                "/display",
                "customer-display",
                "popup,width=1024,height=700",
              )
            }
          >
            <TvRounded fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            title={tr("Vendas recentes")}
            onClick={() => setHistory(true)}
          >
            <HistoryRounded fontSize="small" />
          </IconButton>
        </Stack>
        {drawerClosed && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" component={Link} to="/cash">
                {tr("Abrir caixa")}
              </Button>
            }
          >
            {tr("Abra o caixa para finalizar vendas.")}
          </Alert>
        )}
        <TextField
          fullWidth
          inputRef={inputRef}
          autoFocus
          label={t("scan") + " (F2)"}
          placeholder="Ex.: 001 x 3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void scan();
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded color="primary" />
              </InputAdornment>
            ),
          }}
        />
        {debounced && (
          <Paper variant="outlined" sx={{ maxHeight: 220, overflowY: "auto" }}>
            {products.data?.content.map((p) => (
              <Stack
                key={p.id}
                direction="row"
                alignItems="center"
                gap={1}
                px={1.5}
                py={0.8}
                onClick={() =>
                  !adding &&
                  Number(p.quantity) > 0 &&
                  addProduct(p, parseScan(search).quantity, hasQuantity(search))
                }
                sx={{
                  cursor: Number(p.quantity) > 0 ? "pointer" : "not-allowed",
                  opacity: Number(p.quantity) > 0 ? 1 : 0.5,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box flex={1} minWidth={0}>
                  <Typography fontSize={14} fontWeight={650} noWrap>
                    {p.name}
                  </Typography>
                  <Typography fontSize={11} color="text.secondary">
                    #{p.code} • {tr("estoque")} {qty(p.quantity)} {p.unit}
                  </Typography>
                </Box>
                <Typography fontWeight={750}>{money(p.price)}</Typography>
              </Stack>
            ))}
            {!products.isLoading && !products.data?.content.length && (
              <Typography p={1.5} fontSize={13} color="text.secondary">
                {tr("Nenhum produto encontrado.")}
              </Typography>
            )}
          </Paper>
        )}
        {selectedItem && (
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" alignItems="center">
              <Typography fontWeight={750} flex={1} noWrap>
                {selectedItem.product.name}
              </Typography>
              <Typography fontSize={12} color="text.secondary">
                {tr("Estoque")}:{" "}
                {qty(
                  Number(selectedItem.product.quantity) - selectedItem.quantity,
                )}{" "}
                {selectedItem.product.unit} {tr("após a venda")}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" gap={0.5} mt={1}>
              <IconButton
                size="small"
                onClick={() =>
                  dispatch(
                    change({
                      id: selectedItem.product.id,
                      quantity: Math.max(
                        selectedItem.product.unit === "KG" ? 0.001 : 1,
                        Number(
                          (
                            selectedItem.quantity -
                            (selectedItem.product.unit === "KG" ? 0.1 : 1)
                          ).toFixed(3),
                        ),
                      ),
                    }),
                  )
                }
              >
                <RemoveRounded fontSize="small" />
              </IconButton>
              <TextField
                type="number"
                value={selectedItem.quantity}
                onChange={(e) =>
                  dispatch(
                    change({
                      id: selectedItem.product.id,
                      quantity: Number(e.target.value),
                    }),
                  )
                }
                inputProps={{
                  min: selectedItem.product.unit === "KG" ? 0.001 : 1,
                  step: selectedItem.product.unit === "KG" ? 0.001 : 1,
                  "aria-label": "Quantidade " + selectedItem.product.name,
                }}
                sx={{ width: 100 }}
              />
              <IconButton
                size="small"
                onClick={() =>
                  dispatch(
                    change({
                      id: selectedItem.product.id,
                      quantity: Number(
                        (
                          selectedItem.quantity +
                          (selectedItem.product.unit === "KG" ? 0.1 : 1)
                        ).toFixed(3),
                      ),
                    }),
                  )
                }
              >
                <AddRounded fontSize="small" />
              </IconButton>
              {selectedItem.product.unit === "KG" && (
                <IconButton
                  aria-label="Ler balança"
                  title={tr("Ler balança")}
                  onClick={async () => {
                    try {
                      const kilograms = await readStableWeight();
                      dispatch(
                        change({
                          id: selectedItem.product.id,
                          quantity: kilograms,
                        }),
                      );
                      notice(
                        tr("Peso recebido") + ": " + qty(kilograms) + " kg",
                        "info",
                      );
                    } catch (e) {
                      notice(errorMessage(e), "error");
                    }
                  }}
                >
                  <ScaleRounded fontSize="small" />
                </IconButton>
              )}
              <Box flex={1} />
              <Typography fontSize={13} color="text.secondary">
                {tr("Desc.")} {money(selectedItem.discount)}
              </Typography>
            </Stack>
          </Paper>
        )}
        <Autocomplete
          options={customers.data?.content || []}
          getOptionLabel={(c) => c.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={customer}
          onChange={(_, c) => setCustomer(c)}
          onInputChange={(_, v) => setCustomerSearch(v)}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={customerRef}
              label={tr("Cliente (F7, opcional)")}
              placeholder={tr("Consumidor final")}
              helperText={
                customer
                  ? `${tr("Fiado disponível")}: ${money(Number(customer.creditLimit) - Number(customer.balance))}`
                  : " "
              }
            />
          )}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          {shortcut(
            "F6",
            tr("Desconto no item"),
            () => setDiscountOpen(true),
            !selectedItem,
          )}
          {shortcut("F7", tr("Cliente"), () => customerRef.current?.focus())}
          {shortcut(
            "Del",
            tr("Cancelar item"),
            cancelItem,
            !selectedItem,
            "error",
          )}
          {shortcut(
            "Esc",
            tr("Cancelar venda"),
            cancelSale,
            !cart.length,
            "error",
          )}
        </Box>
        <Stack direction="row" gap={1} alignItems="center">
          <TextField
            label={tr("Tabela de preço")}
            value={table}
            disabled={cart.length > 0}
            onChange={(e) => setTable(e.target.value)}
            sx={{ width: 150 }}
          />
          <Typography fontSize={12} color="text.secondary">
            {tr("↑ ↓ escolhem o item • código x quantidade")}
          </Typography>
        </Stack>
        <Box flex={1} />
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={!canFinish}
          onClick={() => setPayOpen(true)}
          sx={{ py: 1.6, fontSize: 18 }}
        >
          {tr("Formas de pagamento e finalizar")}
          <Box component="span" sx={{ ml: "auto", fontSize: 12, opacity: 0.8 }}>
            F4 / F9
          </Box>
        </Button>
      </Paper>

      {discountOpen && selectedItem && (
        <DiscountDialog
          item={selectedItem}
          onClose={() => {
            setDiscountOpen(false);
            inputRef.current?.focus();
          }}
          onApply={(discount) =>
            dispatch(change({ id: selectedItem.product.id, discount }))
          }
        />
      )}
      {payOpen && (
        <PaymentDialog
          total={total}
          customer={customer}
          table={table}
          onProgress={setPaying}
          onClose={() => {
            setPayOpen(false);
            setPaying(null);
          }}
          onDone={(r, view) => {
            publishDisplay({
              store: storeName,
              items: [],
              total: 0,
              thanks: Number(r.sale.total),
              payment: view,
            });
            setFinished({ ...view, total: Number(r.sale.total) });
            setFreshReceipt(true);
            setReceipt(r);
            setPayOpen(false);
            setPaying(null);
            dispatch(clear());
            setCustomer(null);
            notice(tr("Venda concluída"));
          }}
        />
      )}
      {receipt && (
        <ReceiptDialog
          receipt={receipt}
          autoPrint={freshReceipt}
          cash={freshReceipt && finished ? finished : undefined}
          onClose={() => {
            setReceipt(null);
            setFreshReceipt(false);
            inputRef.current?.focus();
          }}
        />
      )}
      <Dialog
        open={history}
        onClose={() => setHistory(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{tr("Vendas recentes")}</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                {[tr("Venda"), tr("Data"), tr("Total"), tr("Status"), ""].map(
                  (h, i) => (
                    <TableCell key={i}>{h}</TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {sales.data?.content.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>#{s.id}</TableCell>
                  <TableCell>
                    {new Date(s.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{money(s.total)}</TableCell>
                  <TableCell>
                    {s.status === "COMPLETED"
                      ? tr("Concluída")
                      : tr("Cancelada")}
                  </TableCell>
                  <TableCell>
                    <Button
                      onClick={async () => {
                        try {
                          const r = (await dispatch(
                            api.endpoints.get.initiate("/sales/" + s.id, {
                              subscribe: false,
                              forceRefetch: true,
                            }),
                          ).unwrap()) as Receipt;
                          setReceipt(r);
                        } catch (e) {
                          notice(errorMessage(e), "error");
                        }
                      }}
                    >
                      {tr("Recibo")}
                    </Button>
                    {manager && s.status === "COMPLETED" && (
                      <Button
                        color="error"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Cancelar esta venda e estornar estoque/fiado? Devolva os valores externos separadamente.",
                            )
                          )
                            return;
                          try {
                            await send({
                              url: "/sales/" + s.id + "/cancel",
                              method: "POST",
                            }).unwrap();
                            notice(tr("Venda cancelada"));
                          } catch (e) {
                            notice(errorMessage(e), "error");
                          }
                        }}
                      >
                        {tr("Cancelar")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistory(false)}>{tr("Fechar")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Pago, formas de pagamento e troco em destaque, no lado do cliente. */
function PaymentSummary({
  view,
  t,
}: {
  view: PaymentView;
  t: (key: string) => string;
}) {
  return (
    <Stack
      direction="row"
      alignItems="flex-end"
      justifyContent="space-between"
      mt={1}
      gap={2}
    >
      <Box>
        {view.payments.map((p, i) => (
          <Typography key={i} fontSize={20} color={CUSTOMER_SOFT}>
            {t(p.method.toLowerCase())}:{" "}
            {money(p.method === "CASH" ? view.tender || p.amount : p.amount)}
          </Typography>
        ))}
      </Box>
      {view.change > 0 && (
        <Box textAlign="right">
          <Typography fontSize={20} fontWeight={800} color="#ffd166">
            {tr("TROCO")}
          </Typography>
          <Typography
            data-testid="customer-change"
            sx={{ fontSize: { xs: 40, md: 56 }, lineHeight: 1 }}
            fontWeight={900}
            color="#ffd166"
          >
            {money(view.change)}
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

/** Balança no painel do operador: modo, conexão e peso ao vivo. */
function ScaleChip({ status }: { status: ReturnType<typeof scaleStatus> }) {
  if (status.mode === "off")
    return (
      <Chip
        size="small"
        variant="outlined"
        icon={<ScaleRounded />}
        label={tr("Balança desligada")}
      />
    );
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<ScaleRounded />}
      color={
        !status.connected ? "error" : status.stable ? "success" : "warning"
      }
      label={
        !status.connected
          ? tr("Balança desconectada")
          : `${status.mode === "simulation" ? tr("Simulação") + " " : ""}${
              status.kg === null ? "—" : qty(status.kg) + " kg"
            }${status.stable ? "" : " • " + tr("instável")}`
      }
    />
  );
}

/** Atualiza a situação da balança a cada meio segundo enquanto a tela está aberta. */
function useScaleStatus() {
  const [status, setStatus] = useState(scaleStatus);
  useEffect(() => {
    void connectAuthorizedScale();
    const id = setInterval(() => setStatus(scaleStatus()), 500);
    return () => clearInterval(id);
  }, []);
  return status;
}

/** Desconto em reais no item selecionado (F6). */
function DiscountDialog({
  item,
  onClose,
  onApply,
}: {
  item: { product: Product; quantity: number; discount: number };
  onClose: () => void;
  onApply: (discount: number) => void;
}) {
  const [value, setValue] = useState(String(item.discount || ""));
  const gross = lineTotal(item.product.price, item.quantity, 0) / 100;
  const discount = Number(value.replace(",", ".")) || 0;
  const invalid = discount < 0 || discount > gross;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          onApply(Math.round(discount * 100) / 100);
          onClose();
        }}
      >
        <DialogTitle>
          {tr("Desconto")} • {item.product.name}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={tr("Desconto em R$")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={invalid}
            helperText={`${tr("Item")}: ${money(gross)} • ${tr("fica")} ${money(Math.max(0, gross - discount))}`}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{tr("Cancelar")}</Button>
          <Button type="submit" variant="contained" disabled={invalid}>
            {tr("Aplicar")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function PaymentDialog({
  total,
  customer,
  table,
  onClose,
  onDone,
  onProgress,
}: {
  total: number;
  customer: Customer | null;
  table: string;
  onClose: () => void;
  onDone: (r: Receipt, view: PaymentView) => void;
  /** Avisa a tela do cliente sobre as formas escolhidas, o valor recebido e o troco. */
  onProgress: (view: PaymentView) => void;
}) {
  const { t } = useTranslation();
  const cart = useAppSelector((s) => s.cart);
  const [rows, setRows] = useState([{ method: "CASH", amount: total }]);
  const [tender, setTender] = useState(total);
  const [send, { isLoading }] = useSendMutation();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const snapshot = useRef<{
    requestId: string;
    customerId: number | null;
    priceTable: string;
    items: { productId: number; quantity: number; discount: number }[];
    payments: typeof rows;
  } | null>(null);
  const paid = rows.reduce((s, p) => s + Math.round(p.amount * 100), 0);
  const cash = rows
    .filter((r) => r.method === "CASH")
    .reduce((s, p) => s + p.amount, 0);
  const locked = isLoading || pending;
  const settings = useData<Record<string, string>>("/settings");
  // Prazo real do fiado: o do cliente ou o padrão da loja.
  const termDays =
    customer?.termDays ?? Number(settings.data?.["credit.termDays"] ?? 30);
  const view: PaymentView = {
    payments: rows.map((r) => ({ method: r.method, amount: r.amount })),
    tender: cash > 0 ? tender : 0,
    change: cash > 0 ? Math.max(0, Math.round((tender - cash) * 100) / 100) : 0,
  };
  const viewKey = JSON.stringify(view);
  useEffect(() => {
    onProgress(JSON.parse(viewKey) as PaymentView);
  }, [viewKey, onProgress]);
  const ready =
    !isLoading &&
    (pending ||
      (paid === Math.round(total * 100) &&
        !rows.some((r) => r.amount <= 0) &&
        cash <= tender));
  const checkout = async () => {
    setError("");
    if (!snapshot.current)
      snapshot.current = {
        requestId: crypto.randomUUID(),
        customerId: customer?.id ?? null,
        priceTable: table,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          discount: i.discount,
        })),
        payments: rows.map((r) => ({ ...r })),
      };
    setPending(true);
    try {
      const receipt = (await send({
        url: "/sales",
        method: "POST",
        body: snapshot.current,
      }).unwrap()) as Receipt;
      onDone(receipt, JSON.parse(viewKey) as PaymentView);
    } catch (e) {
      setError(errorMessage(e));
      const status = (e as { status?: number | string }).status;
      if (typeof status === "number" && status < 500) {
        snapshot.current = null;
        setPending(false);
      }
    }
  };
  // F9 confirma o pagamento com o diálogo aberto.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        if (ready) void checkout();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  return (
    <Dialog open onClose={locked ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{tr("Finalizar venda")}</DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          <Typography variant="h3" fontWeight={800} color="primary">
            {money(total)}
          </Typography>
          <Typography color="text.secondary">
            {customer?.name || tr("Consumidor final")}
          </Typography>
          {error && (
            <Alert severity="error">
              {error}
              {pending &&
                " Reenvie para confirmar o resultado da mesma venda, sem duplicar."}
            </Alert>
          )}
          {rows.map((row, index) => (
            <Stack direction="row" gap={1} key={index}>
              <TextField
                select
                label={tr("Forma de pagamento")}
                sx={{ flex: 1 }}
                value={row.method}
                disabled={locked}
                onChange={(e) =>
                  setRows(
                    rows.map((r, i) =>
                      i === index ? { ...r, method: e.target.value } : r,
                    ),
                  )
                }
              >
                {METHODS.map((m) => (
                  <MenuItem
                    key={m}
                    value={m}
                    disabled={m === "ACCOUNT" && !customer}
                  >
                    {t(m.toLowerCase())}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                type="number"
                label={tr("Valor R$")}
                sx={{ width: 130 }}
                value={row.amount}
                disabled={locked}
                inputProps={{ min: 0.01, step: 0.01 }}
                onChange={(e) =>
                  setRows(
                    rows.map((r, i) =>
                      i === index
                        ? { ...r, amount: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
              />
              {rows.length > 1 && (
                <IconButton
                  disabled={locked}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              )}
            </Stack>
          ))}
          <Button
            disabled={locked || rows.length >= 6}
            startIcon={<AddRounded />}
            onClick={() =>
              setRows([
                ...rows,
                {
                  method: "PIX",
                  amount: Math.max(0, (Math.round(total * 100) - paid) / 100),
                },
              ])
            }
          >
            {tr("Dividir pagamento")}
          </Button>
          {cash > 0 && (
            <Stack direction="row" gap={2} alignItems="center">
              <TextField
                label={tr("Dinheiro recebido R$")}
                type="number"
                value={tender}
                disabled={locked}
                inputProps={{ min: cash, step: 0.01 }}
                onChange={(e) => setTender(Number(e.target.value))}
              />
              <Typography fontWeight={700}>
                Troco: {money(Math.max(0, tender - cash))}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" justifyContent="space-between">
            <Typography>{tr("Falta pagar")}</Typography>
            <Typography
              fontWeight={750}
              color={
                paid === Math.round(total * 100)
                  ? "success.main"
                  : "warning.main"
              }
            >
              {money((Math.round(total * 100) - paid) / 100)}
            </Typography>
          </Stack>
          {rows.some((r) => r.method === "ACCOUNT") && (
            <Alert severity="info">
              Disponível no fiado:{" "}
              {money(Number(customer?.creditLimit) - Number(customer?.balance))}
              . {tr("Vencimento em")} {termDays} {tr("dias")}.
            </Alert>
          )}
          <Typography variant="caption" color="text.secondary">
            Cartão, Pix e vale: confirme o recebimento na maquininha ou banco
            antes de registrar. Este sistema registra o pagamento; não processa
            a cobrança.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={locked} onClick={onClose}>
          {tr("Voltar")}
        </Button>
        <Button variant="contained" disabled={!ready} onClick={checkout}>
          {isLoading
            ? tr("Concluindo…")
            : pending
              ? tr("Consultar / reenviar venda")
              : tr("Confirmar pagamento") + " (F9)"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
/** Conteúdo do recibo em 80 mm (Control iD), usado na tela e na impressão. */
function ReceiptBody({
  receipt,
  settings,
  cash,
}: {
  receipt: Receipt;
  settings?: Record<string, string>;
  cash?: PaymentView;
}) {
  const footer =
    settings?.["store.footer"] || "Obrigado pela preferência! Volte sempre.";
  return (
    <div className="receipt">
      <h2>{settings?.["store.name"] || "Meu Mercadinho"}</h2>
      <p style={{ textAlign: "center" }}>
        {settings?.["store.address"]}
        {settings?.["store.cnpj"] && (
          <>
            <br />
            CNPJ {settings["store.cnpj"]}
          </>
        )}
        {settings?.["store.phone"] && (
          <>
            <br />
            Tel. {settings["store.phone"]}
          </>
        )}
      </p>
      <hr />
      <p>
        COMPROVANTE NÃO FISCAL
        <br />
        Venda #{receipt.sale.id} •{" "}
        {receipt.sale.status === "CANCELLED" ? "CANCELADA" : "CONCLUÍDA"}
        <br />
        {new Date(receipt.sale.createdAt).toLocaleString("pt-BR")}
        <br />
        Operador: {receipt.sale.user.username}
        <br />
        Cliente: {receipt.sale.customer?.name || tr("Consumidor final")}
      </p>
      <hr />
      <table>
        <tbody>
          {receipt.items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.productName}
                <br />
                {qty(i.quantity)} {i.unit} x {money(i.unitPrice)}
                {Number(i.discount) > 0 && (
                  <>
                    <br />
                    Desc.: {money(i.discount)}
                  </>
                )}
              </td>
              <td className="right">{money(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <h3>TOTAL: {money(receipt.sale.total)}</h3>
      {receipt.payments.map((p, i) => (
        <p key={i}>
          {p.method}: {money(p.amount)}
        </p>
      ))}
      {cash && cash.change > 0 && (
        <p>
          Recebido em dinheiro: {money(cash.tender)}
          <br />
          <b>TROCO: {money(cash.change)}</b>
        </p>
      )}
      <hr />
      <p style={{ textAlign: "center", whiteSpace: "pre-line" }}>{footer}</p>
    </div>
  );
}

export function ReceiptDialog({
  receipt,
  onClose,
  autoPrint = false,
  cash,
}: {
  receipt: Receipt;
  onClose: () => void;
  /** Recebido e troco, só no recibo da venda que acabou de ser paga. */
  cash?: PaymentView;
  /** Imprime sozinho ao abrir, se Ajustes permitir (usado ao finalizar a venda). */
  autoPrint?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const printed = useRef(false);
  const print = useReactToPrint({
    contentRef: ref,
    documentTitle: "Venda-" + receipt.sale.id,
  });
  const { data: settings } = useData<Record<string, string>>("/settings");
  const copies = Math.min(
    3,
    Math.max(1, Number(settings?.["receipt.copies"] || 1)),
  );
  useEffect(() => {
    if (!autoPrint || !settings || printed.current) return;
    printed.current = true;
    if (settings["receipt.autoPrint"] !== "false") print();
  }, [autoPrint, settings, print]);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        <Stack direction="row" gap={1} alignItems="center">
          <CheckCircleRounded color="success" />
          Recibo da venda #{receipt.sale.id}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <ReceiptBody receipt={receipt} settings={settings} cash={cash} />
        {/* Área impressa: uma cópia por via, cada uma em sua página. */}
        <div style={{ display: "none" }}>
          <div ref={ref}>
            {Array.from({ length: copies }, (_, i) => (
              <div key={i} className="receipt-copy">
                <ReceiptBody
                  receipt={receipt}
                  settings={settings}
                  cash={cash}
                />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr("Fechar")}</Button>
        <Button
          startIcon={<PrintRounded />}
          variant="contained"
          onClick={() => print()}
        >
          {tr("Imprimir recibo")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
