import { tr } from "./i18n";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import {
  DashboardRounded,
  Inventory2Rounded,
  PointOfSaleRounded,
  PeopleAltRounded,
  BarChartRounded,
  SettingsRounded,
  LogoutRounded,
  StorefrontRounded,
  MenuRounded,
  DarkModeRounded,
  AccountBalanceWalletRounded,
  WarehouseRounded,
  LocalShippingRounded,
  AccountBalanceRounded,
  ReceiptLongRounded,
  LightModeRounded,
} from "@mui/icons-material";
import {
  NavLink,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Client } from "@stomp/stompjs";
import {
  api,
  clear,
  login,
  logout,
  useAppDispatch,
  useAppSelector,
  useData,
  useSendMutation,
} from "./store";
import { NoticeContext } from "./components/Common";
import { errorMessage } from "./utils";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Cash from "./pages/Cash";
import Stock from "./pages/Stock";
import Purchases from "./pages/Purchases";
import Finance from "./pages/Finance";
import Bills from "./pages/Bills";
import CustomerDisplay from "./pages/CustomerDisplay";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
const nav = [
  ["/", "dashboard", DashboardRounded],
  ["/sales", "sales", PointOfSaleRounded],
  ["/cash", "cashDrawer", AccountBalanceWalletRounded],
  ["/products", "products", Inventory2Rounded],
  ["/stock", "stock", WarehouseRounded],
  ["/purchases", "purchases", LocalShippingRounded],
  ["/finance", "finance", AccountBalanceRounded],
  ["/bills", "bills", ReceiptLongRounded],
  ["/customers", "customers", PeopleAltRounded],
  ["/reports", "reports", BarChartRounded],
  ["/settings", "settings", SettingsRounded],
] as const;
export default function App() {
  const auth = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [open, setOpen] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const onSales = location.pathname === "/sales";
  const [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState<{
    message: string;
    severity: "success" | "error" | "info";
  } | null>(null);
  const [send] = useSendMutation();
  const { data: settings } = useData<Record<string, string>>(
    "/settings",
    !auth,
  );
  useEffect(() => {
    if (settings?.theme) setMode(settings.theme as "light" | "dark");
    if (settings?.language) void i18n.changeLanguage(settings.language);
  }, [settings, i18n]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!auth) return;
    const client = new Client({
      brokerURL:
        (locationProtocol() ? "wss://" : "ws://") +
        window.location.host +
        "/ws/updates",
      connectHeaders: { Authorization: "Bearer " + auth.token },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        client.subscribe("/topic/updates", (message) => {
          dispatch(api.util.invalidateTags(["Data"]));
          try {
            if (JSON.parse(message.body).type === "alerts")
              setNotice({
                message: "Confira os alertas de estoque e validade.",
                severity: "info",
              });
          } catch {
            /* Ignore malformed event. */
          }
        });
      },
    });
    client.activate();
    const expiry =
      JSON.parse(
        atob(auth.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).exp * 1000;
    const timer = setTimeout(
      () => {
        dispatch(logout());
        dispatch(clear());
        dispatch(api.util.resetApiState());
      },
      Math.max(0, expiry - Date.now()),
    );
    return () => {
      clearTimeout(timer);
      void client.deactivate();
    };
  }, [auth, dispatch]);
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === "light" ? "#087f5b" : "#58d6a7" },
          secondary: { main: "#cc8438" },
          background: {
            default: mode === "light" ? "#f5f7f5" : "#111b18",
            paper: mode === "light" ? "#ffffff" : "#1a2823",
          },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
          h4: { fontSize: "1.8rem" },
          button: { textTransform: "none", fontWeight: 650 },
        },
        components: {
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: { root: { borderRadius: 9, padding: "9px 17px" } },
          },
          MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
              outlined: {
                borderColor: mode === "light" ? "#e3e9e5" : "#30433a",
              },
            },
          },
          MuiTextField: { defaultProps: { size: "small" } },
          MuiTableCell: {
            styleOverrides: {
              head: {
                fontWeight: 700,
                backgroundColor: mode === "light" ? "#f7f9f7" : "#20332a",
              },
            },
          },
        },
      }),
    [mode],
  );
  const toggle = async () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    try {
      await send({
        url: "/settings",
        method: "PUT",
        body: { theme: next },
      }).unwrap();
    } catch (e) {
      setNotice({ message: errorMessage(e), severity: "error" });
    }
  };
  const renderMenu = (compact: boolean) => (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        px: compact ? 1.2 : 2.3,
        py: 2,
      }}
    >
      <Stack direction="row" gap={1.3} alignItems="center" mb={2}>
        <Avatar
          variant="rounded"
          sx={{ bgcolor: "primary.main", width: 41, height: 41 }}
        >
          <StorefrontRounded />
        </Avatar>
        <Box sx={{ display: compact ? "none" : "block" }}>
          <Typography fontWeight={800} fontSize={19}>
            sistema<span style={{ color: "#15986e" }}>java</span>
          </Typography>
          <Typography fontSize={10} letterSpacing={2} color="text.secondary">
            MERCADINHO • PDV
          </Typography>
        </Box>
      </Stack>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{
          pl: 1.5,
          fontSize: 10,
          visibility: compact ? "hidden" : "visible",
        }}
      >
        {tr("SEU NEGÓCIO")}
      </Typography>
      <List sx={{ mt: 0.5 }}>
        {nav
          .filter(
            (n) =>
              !["reports", "purchases", "finance", "bills"].includes(n[1]) ||
              auth?.role !== "CASHIER",
          )
          .map(([path, label, Icon]) => (
            <ListItemButton
              component={NavLink}
              to={path}
              key={path}
              end={path === "/"}
              sx={{
                mb: 0.25,
                borderRadius: 2,
                py: 0.7,
                "&.active": {
                  bgcolor: "action.selected",
                  color: "primary.main",
                  "& .MuiListItemIcon-root": { color: "primary.main" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={t(label)}
                primaryTypographyProps={{
                  fontSize: 14,
                  fontWeight: 600,
                  noWrap: true,
                }}
                sx={{ display: compact ? "none" : "block" }}
              />
            </ListItemButton>
          ))}
      </List>
      <Box sx={{ mt: "auto" }}>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 1.5,
            bgcolor: "action.hover",
            display: compact ? "none" : { xs: "none", xl: "block" },
          }}
        >
          <Typography fontSize={12} fontWeight={700}>
            {settings?.["store.name"] || "Meu Mercadinho"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Gestão simples. Mercado em dia.
          </Typography>
        </Paper>
        <Divider />
        <Stack
          direction={compact ? "column" : "row"}
          alignItems="center"
          gap={1}
          pt={2}
        >
          <Avatar
            sx={{
              width: 34,
              height: 34,
              fontSize: 14,
              bgcolor: "primary.main",
            }}
          >
            {auth?.username[0]?.toUpperCase()}
          </Avatar>
          <Box flex={1} sx={{ display: compact ? "none" : "block" }}>
            <Typography fontSize={13} fontWeight={700}>
              {auth?.username}
            </Typography>
            <Typography fontSize={10} color="text.secondary">
              {auth?.role}
            </Typography>
          </Box>
          <IconButton
            title={t("logout")}
            onClick={() => {
              dispatch(logout());
              dispatch(clear());
              dispatch(api.util.resetApiState());
            }}
          >
            <LogoutRounded fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NoticeContext.Provider
        value={(message, severity = "success") =>
          setNotice({ message, severity })
        }
      >
        {location.pathname === "/display" ? (
          <CustomerDisplay />
        ) : !auth ? (
          <Login />
        ) : (
          // Menu lateral à direita: row-reverse coloca o nav depois do conteúdo.
          <Box
            sx={{
              display: "flex",
              flexDirection: "row-reverse",
              minHeight: "100vh",
            }}
          >
            <Box
              component="nav"
              sx={{ width: { lg: onSales ? 72 : 236 }, flexShrink: 0 }}
            >
              {/* Na Frente de Caixa o menu fica só com ícones e abre por cima ao passar o mouse. */}
              <Drawer
                variant="permanent"
                anchor="right"
                PaperProps={{
                  onMouseEnter: () => setMenuHover(true),
                  onMouseLeave: () => setMenuHover(false),
                }}
                sx={{
                  display: { xs: "none", lg: "block" },
                  "& .MuiDrawer-paper": {
                    width: onSales && !menuHover ? 72 : 236,
                    boxSizing: "border-box",
                    overflowX: "hidden",
                    transition: "width .15s",
                    boxShadow: onSales && menuHover ? 8 : undefined,
                  },
                }}
              >
                {renderMenu(onSales && !menuHover)}
              </Drawer>
              <Drawer
                anchor="right"
                open={open}
                onClose={() => setOpen(false)}
                sx={{
                  display: { lg: "none" },
                  "& .MuiDrawer-paper": { width: 250 },
                }}
              >
                {renderMenu(false)}
              </Drawer>
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <AppBar
                position="sticky"
                color="inherit"
                elevation={0}
                sx={{ borderBottom: 1, borderColor: "divider" }}
              >
                <Toolbar sx={{ gap: 1.5, minHeight: "66px!important" }}>
                  <IconButton
                    aria-label={tr("Abrir menu")}
                    onClick={() => setOpen(true)}
                    sx={{ display: { lg: "none" }, order: 99 }}
                  >
                    <MenuRounded />
                  </IconButton>
                  <Typography fontWeight={600} fontSize={14} sx={{ flex: 1 }}>
                    Mercado /{" "}
                    {t(
                      nav.find(([p]) => p === location.pathname)?.[1] ||
                        "dashboard",
                    )}
                  </Typography>
                  <Chip
                    size="small"
                    label={online ? tr("Conectado") : tr("Sem conexão")}
                    color={online ? "success" : "error"}
                    variant="outlined"
                  />
                  <Typography
                    color="text.secondary"
                    fontSize={12}
                    sx={{ display: { xs: "none", sm: "block" } }}
                  >
                    {new Date().toLocaleDateString("pt-BR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Typography>
                  <IconButton aria-label={tr("Alternar tema")} onClick={toggle}>
                    {mode === "light" ? (
                      <DarkModeRounded fontSize="small" />
                    ) : (
                      <LightModeRounded fontSize="small" />
                    )}
                  </IconButton>
                </Toolbar>
              </AppBar>
              {!online && (
                <Alert severity="warning">
                  Sem conexão. Reconecte antes de finalizar uma venda.
                </Alert>
              )}
              <Box
                component="main"
                sx={{ p: { xs: 2, md: 3.5 }, maxWidth: 1700, mx: "auto" }}
              >
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/cash" element={<Cash />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/stock" element={<Stock />} />
                  <Route
                    path="/bills"
                    element={
                      auth.role === "CASHIER" ? <Navigate to="/" /> : <Bills />
                    }
                  />
                  <Route
                    path="/finance"
                    element={
                      auth.role === "CASHIER" ? (
                        <Navigate to="/" />
                      ) : (
                        <Finance />
                      )
                    }
                  />
                  <Route
                    path="/purchases"
                    element={
                      auth.role === "CASHIER" ? (
                        <Navigate to="/" />
                      ) : (
                        <Purchases />
                      )
                    }
                  />
                  <Route path="/customers" element={<Customers />} />
                  <Route
                    path="/reports"
                    element={
                      auth.role === "CASHIER" ? (
                        <Navigate to="/" />
                      ) : (
                        <Reports />
                      )
                    }
                  />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Box>
            </Box>
          </Box>
        )}
        <Snackbar
          open={!!notice}
          autoHideDuration={5500}
          onClose={() => setNotice(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            variant="filled"
            severity={notice?.severity || "success"}
            onClose={() => setNotice(null)}
          >
            {notice?.message}
          </Alert>
        </Snackbar>
      </NoticeContext.Provider>
    </ThemeProvider>
  );
}
function locationProtocol() {
  return window.location.protocol === "https:";
}
function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [send, { isLoading }] = useSendMutation();
  const dispatch = useAppDispatch();
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      }}
    >
      <Box
        sx={{
          bgcolor: "#075e46",
          color: "white",
          p: { xs: 4, md: 8 },
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <StorefrontRounded sx={{ fontSize: 55, mb: 3 }} />
        <Typography variant="h3" fontWeight={800} mb={2}>
          {tr("Seu mercado.")}
          <br />
          {tr("Tudo em ordem.")}
        </Typography>
        <Typography sx={{ maxWidth: 390, color: "#bae4d5", lineHeight: 1.8 }}>
          Do primeiro atendimento ao fechamento do dia. Um jeito mais simples de
          cuidar do seu negócio.
        </Typography>
        <Stack direction="row" gap={1} mt={4}>
          <Chip
            label={tr("Caixa")}
            sx={{ color: "#d5f4e9", bgcolor: "#18765d" }}
          />
          <Chip
            label={tr("Estoque")}
            sx={{ color: "#d5f4e9", bgcolor: "#18765d" }}
          />
          <Chip
            label={tr("Gestão")}
            sx={{ color: "#d5f4e9", bgcolor: "#18765d" }}
          />
        </Stack>
      </Box>
      <Stack justifyContent="center" alignItems="center" p={4}>
        <Box
          component="form"
          sx={{ width: "100%", maxWidth: 370 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const auth = await send({
                url: "/auth/login",
                method: "POST",
                body: { username, password },
              }).unwrap();
              dispatch(login(auth as Parameters<typeof login>[0]));
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          <Typography fontWeight={800} fontSize={25}>
            {tr("Bem-vindo ao SistemaJava")}
          </Typography>
          <Typography color="text.secondary" mb={4} mt={1}>
            {tr("Entre para começar seu atendimento.")}
          </Typography>
          <Stack gap={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={tr("Usuário")}
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              label={tr("Senha")}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
            >
              {isLoading ? tr("Entrando…") : tr("Entrar no sistema")}
            </Button>
          </Stack>
          <Typography
            variant="caption"
            display="block"
            color="text.secondary"
            mt={3}
          >
            {tr("Acesso inicial: admin e a senha definida na instalação.")}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
