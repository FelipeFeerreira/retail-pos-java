import { tr } from "../i18n";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ScaleRounded, UsbRounded } from "@mui/icons-material";
import {
  authorizeScale,
  disconnectScale,
  loadConfig,
  PROTOCOLS,
  Protocol,
  readStableWeight,
  saveConfig,
  ScaleConfig,
  serialSupported,
  SimState,
} from "../services/scale";
import { qty } from "../utils";

/** Configuração da balança deste computador (fica no navegador do caixa). */
export default function ScaleSettings() {
  const [config, setConfig] = useState<ScaleConfig>(loadConfig);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<ScaleConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
    setResult(null);
  };
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await action() });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <ScaleRounded color="primary" />
        <Typography fontWeight={700}>{tr("Balança deste caixa")}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        {tr(
          "Toledo Prix 8217 ligada neste computador. Na Frente de caixa, produtos vendidos por KG pegam o peso sozinhos quando nenhuma quantidade é digitada.",
        )}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} gap={2} mb={2}>
        <TextField
          select
          label={tr("Modo")}
          value={config.mode}
          onChange={(e) =>
            update({ mode: e.target.value as ScaleConfig["mode"] })
          }
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="off">{tr("Desligada (digitar o peso)")}</MenuItem>
          <MenuItem value="serial">
            {tr("Balança conectada (porta COM)")}
          </MenuItem>
          <MenuItem value="simulation">
            {tr("Simulação (sem balança)")}
          </MenuItem>
        </TextField>
        {config.mode === "serial" && (
          <TextField
            select
            label={tr("Protocolo")}
            value={config.protocol}
            onChange={(e) => {
              void disconnectScale();
              update({ protocol: e.target.value as Protocol });
            }}
            sx={{ minWidth: 260 }}
          >
            {(Object.keys(PROTOCOLS) as Protocol[]).map((p) => (
              <MenuItem key={p} value={p}>
                {PROTOCOLS[p].label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
      {config.mode === "serial" && !serialSupported() && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {tr(
            "Este navegador não acessa portas COM. Abra o sistema pelo Chrome ou pelo Edge (o iniciar.bat já abre o Edge).",
          )}
        </Alert>
      )}
      {config.mode === "simulation" && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
            mb: 2,
          }}
        >
          <TextField
            label={tr("Peso simulado (kg)")}
            type="number"
            value={config.simWeight}
            onChange={(e) => update({ simWeight: Number(e.target.value) })}
            inputProps={{ min: 0, step: 0.005 }}
          />
          <TextField
            select
            label={tr("Situação simulada")}
            value={config.simState}
            onChange={(e) => update({ simState: e.target.value as SimState })}
          >
            <MenuItem value="ok">{tr("Peso estável")}</MenuItem>
            <MenuItem value="unstable">{tr("Peso instável")}</MenuItem>
            <MenuItem value="zero">{tr("Peso zero")}</MenuItem>
            <MenuItem value="disconnected">
              {tr("Balança desconectada")}
            </MenuItem>
          </TextField>
        </Box>
      )}
      {config.mode !== "off" && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {config.mode === "serial" && (
            <Button
              variant="outlined"
              startIcon={<UsbRounded />}
              disabled={busy || !serialSupported()}
              onClick={() =>
                run(async () => {
                  await authorizeScale(config.protocol);
                  return tr(
                    "Porta conectada. Clique em Testar leitura com um produto na balança.",
                  );
                })
              }
            >
              {tr("Conectar balança (escolher porta COM)")}
            </Button>
          )}
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              run(
                async () =>
                  tr("Peso lido") +
                  ": " +
                  qty(await readStableWeight(config)) +
                  " kg",
              )
            }
          >
            {busy ? tr("Lendo…") : tr("Testar leitura")}
          </Button>
        </Stack>
      )}
      {result && (
        <Alert severity={result.ok ? "success" : "error"} sx={{ mt: 2 }}>
          {result.text}
        </Alert>
      )}
    </Paper>
  );
}
