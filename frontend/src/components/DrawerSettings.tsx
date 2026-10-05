import { tr } from "../i18n";
import { useEffect, useState } from "react";
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
import { PointOfSaleRounded } from "@mui/icons-material";
import { useData, useSendMutation } from "../store";
import { errorMessage } from "../utils";

const KEYS = [
  "drawer.mode",
  "drawer.host",
  "drawer.port",
  "drawer.pin",
  "drawer.auto",
];

/** Gaveta de dinheiro ligada na impressora térmica Control iD. */
export default function DrawerSettings({ manager }: { manager: boolean }) {
  const settings = useData<Record<string, string>>("/settings");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [send, { isLoading }] = useSendMutation();
  useEffect(() => {
    if (!settings.data) return;
    setValues({
      "drawer.mode": settings.data["drawer.mode"] ?? "off",
      "drawer.host": settings.data["drawer.host"] ?? "",
      "drawer.port": settings.data["drawer.port"] ?? "9100",
      "drawer.pin": settings.data["drawer.pin"] ?? "0",
      "drawer.auto": settings.data["drawer.auto"] ?? "cash",
    });
  }, [settings.data]);
  const set = (key: string, value: string) => {
    setValues({ ...values, [key]: value });
    setResult(null);
  };
  const run = async (action: () => Promise<unknown>, ok: string) => {
    setResult(null);
    try {
      await action();
      setResult({ ok: true, text: ok });
    } catch (e) {
      setResult({ ok: false, text: errorMessage(e) });
    }
  };
  const network = values["drawer.mode"] === "network";
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <PointOfSaleRounded color="primary" />
        <Typography fontWeight={700}>{tr("Gaveta de dinheiro")}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        {tr(
          "A gaveta é ligada no conector da impressora Control iD. Com a impressora em rede, o sistema manda o comando de abrir direto para ela.",
        )}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {tr(
          "Impressora só em USB: o sistema não consegue mandar o comando direto. Abra Painel de Controle → Impressoras → Control iD → Preferências de impressão e procure a opção de acionar a gaveta (gaveta/cash drawer): assim ela abre a cada recibo impresso.",
        )}
      </Alert>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
          mb: 2,
        }}
      >
        <TextField
          select
          label={tr("Conexão da gaveta")}
          value={values["drawer.mode"] ?? "off"}
          onChange={(e) => set("drawer.mode", e.target.value)}
          disabled={!manager}
        >
          <MenuItem value="off">{tr("Desligada / pelo driver USB")}</MenuItem>
          <MenuItem value="network">{tr("Impressora em rede (IP)")}</MenuItem>
        </TextField>
        <TextField
          select
          label={tr("Abrir sozinha")}
          value={values["drawer.auto"] ?? "cash"}
          onChange={(e) => set("drawer.auto", e.target.value)}
          disabled={!manager || !network}
        >
          <MenuItem value="cash">{tr("Em venda com dinheiro")}</MenuItem>
          <MenuItem value="always">{tr("Em toda venda")}</MenuItem>
          <MenuItem value="never">{tr("Nunca (só no botão)")}</MenuItem>
        </TextField>
        {network && (
          <>
            <TextField
              label={tr("IP da impressora (ex.: 192.168.0.50)")}
              value={values["drawer.host"] ?? ""}
              onChange={(e) => set("drawer.host", e.target.value.trim())}
              disabled={!manager}
              helperText={tr(
                "Aparece no autoteste da impressora (segure o botão de avanço ao ligar)",
              )}
            />
            <Stack direction="row" gap={2}>
              <TextField
                label={tr("Porta")}
                value={values["drawer.port"] ?? "9100"}
                onChange={(e) =>
                  set("drawer.port", e.target.value.replace(/\D/g, ""))
                }
                disabled={!manager}
                sx={{ flex: 1 }}
              />
              <TextField
                select
                label={tr("Pino")}
                value={values["drawer.pin"] ?? "0"}
                onChange={(e) => set("drawer.pin", e.target.value)}
                disabled={!manager}
                helperText={tr("Troque se não abrir")}
                sx={{ flex: 1 }}
              >
                <MenuItem value="0">2</MenuItem>
                <MenuItem value="1">5</MenuItem>
              </TextField>
            </Stack>
          </>
        )}
      </Box>
      <Stack direction="row" gap={1}>
        {manager && (
          <Button
            variant="contained"
            disabled={isLoading}
            onClick={() =>
              run(
                () =>
                  send({
                    url: "/settings",
                    method: "PUT",
                    body: Object.fromEntries(
                      KEYS.map((k) => [k, values[k] ?? ""]),
                    ),
                  }).unwrap(),
                tr("Configuração da gaveta salva"),
              )
            }
          >
            {tr("Salvar")}
          </Button>
        )}
        {network && (
          <Button
            variant="outlined"
            disabled={isLoading}
            onClick={() =>
              run(
                () =>
                  send({
                    url: "/drawer/open",
                    method: "POST",
                    body: { reason: "Teste em Ajustes" },
                  }).unwrap(),
                tr("Comando enviado: a gaveta deve abrir."),
              )
            }
          >
            {tr("Testar gaveta (salve antes)")}
          </Button>
        )}
      </Stack>
      {result && (
        <Alert severity={result.ok ? "success" : "error"} sx={{ mt: 2 }}>
          {result.text}
        </Alert>
      )}
    </Paper>
  );
}
