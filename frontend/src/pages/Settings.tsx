import { tr } from "../i18n";
import ScaleSettings from "../components/ScaleSettings";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  AddRounded,
  BackupRounded,
  RestoreRounded,
  SaveRounded,
} from "@mui/icons-material";
import { useAppSelector, useData, useSendMutation } from "../store";
import { errorMessage } from "../utils";
import { Field, FormDialog, Heading, useNotice } from "../components/Common";
export default function Settings() {
  const role = useAppSelector((s) => s.auth?.role);
  const admin = role === "ADMIN";
  const manager = role !== "CASHIER";
  const { data } = useData<Record<string, string>>("/settings");
  const printers =
    useData<
      { id: number; name: string; connection: string; address: string }[]
    >("/printers");
  const scales =
    useData<{ id: number; name: string; protocol: string; port: string }[]>(
      "/scales",
    );
  const backups = useData<
    { filename: string; bytes: number; createdAt: string }[]
  >("/backup", !admin);
  const users = useData<{ id: number; username: string; role: string }[]>(
    "/users",
    !admin,
  );
  const logs = useData<{
    content: {
      id: number;
      createdAt: string;
      actor: string;
      action: string;
      entity: string;
      entityId: string;
      details: string;
    }[];
  }>("/audit-log", !admin);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<"printer" | "scale" | "user" | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  useEffect(() => {
    if (data) setValues(data);
  }, [data]);
  const mutate = async (url: string, method: string, body?: unknown) => {
    try {
      return await send({ url, method, body }).unwrap();
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };
  const save = async () => {
    try {
      await mutate(
        "/settings",
        "PUT",
        manager
          ? values
          : {
              theme: values.theme || "light",
              language: values.language || "pt",
            },
      );
      notice(tr("Configurações salvas"));
    } catch (e) {
      notice(errorMessage(e), "error");
    }
  };
  const field = (key: string, label: string, type = "text") => (
    <TextField
      key={key}
      label={label}
      type={type}
      value={values[key] ?? ""}
      onChange={(e) => setValues({ ...values, [key]: e.target.value })}
      inputProps={
        type === "number" ? { min: 0, max: 100, step: 0.01 } : undefined
      }
    />
  );
  const fields: Record<string, Field[]> = {
    printer: [
      { key: "name", label: tr("Nome"), required: true },
      {
        key: "type",
        label: tr("Conexão"),
        required: true,
        options: [
          { value: "BROWSER", label: tr("Navegador / driver do sistema") },
          { value: "CUPS", label: tr("CUPS (via driver local)") },
          { value: "USB", label: tr("USB (via driver local)") },
        ],
      },
      {
        key: "address",
        label: tr("Nome da fila / identificação"),
        required: true,
      },
    ],
    scale: [
      { key: "name", label: tr("Nome"), required: true },
      { key: "type", label: tr("Protocolo"), required: true },
      { key: "address", label: tr("Porta / identificação"), required: true },
    ],
    user: [
      { key: "username", label: tr("Usuário"), required: true },
      {
        key: "password",
        label: tr("Senha (8 a 72 caracteres)"),
        type: "password",
        required: true,
      },
      {
        key: "role",
        label: tr("Perfil"),
        required: true,
        options: [
          { value: "CASHIER", label: tr("Caixa") },
          { value: "MANAGER", label: tr("Gerente") },
          { value: "ADMIN", label: tr("Administrador") },
        ],
      },
    ],
  };
  return (
    <>
      <Heading
        title={tr("Ajustes")}
        subtitle={tr("O sistema do jeito que o seu mercado precisa.")}
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        sx={{ mb: 3 }}
      >
        <Tab label={tr("Preferências")} />
        <Tab label={tr("Equipamentos")} />
        {admin && <Tab label={tr("Backup e recuperação")} />}
        {admin && <Tab label={tr("Usuários e auditoria")} />}
      </Tabs>
      {tab === 0 && (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 820 }}>
          <Typography fontWeight={700} mb={2}>
            {tr("Sua experiência")}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2} mb={3}>
            <TextField
              select
              label={tr("Tema")}
              sx={{ minWidth: 200 }}
              value={values.theme || "light"}
              onChange={(e) => setValues({ ...values, theme: e.target.value })}
            >
              <MenuItem value="light">{tr("Claro")}</MenuItem>
              <MenuItem value="dark">{tr("Escuro")}</MenuItem>
            </TextField>
            <TextField
              select
              label={tr("Idioma")}
              sx={{ minWidth: 200 }}
              value={values.language || "pt"}
              onChange={(e) =>
                setValues({ ...values, language: e.target.value })
              }
            >
              <MenuItem value="pt">Português</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </TextField>
          </Stack>
          {manager && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography fontWeight={700} mb={2}>
                {tr("Dados do mercado")}
              </Typography>
              <Stack gap={2}>
                {field("store.name", tr("Nome do estabelecimento"))}
                {field("store.address", tr("Endereço no recibo"))}
                {field("store.cnpj", tr("CNPJ no recibo (opcional)"))}
                {field("store.phone", tr("Telefone no recibo (opcional)"))}
                {field("store.footer", tr("Rodapé do recibo"))}
              </Stack>
              <Divider sx={{ my: 3 }} />
              <Typography fontWeight={700} mb={1}>
                {tr("Calendário do bairro")}
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {tr(
                  "Usado nas análises por tipo de dia. Feriados nacionais já estão incluídos; o 5º dia útil conta como dia de pagamento.",
                )}
              </Typography>
              <Stack gap={2}>
                {field(
                  "calendar.payDays",
                  tr("Dias de pagamento no mês (ex.: 5,15,20,30)"),
                )}
                {field(
                  "calendar.localHolidays",
                  tr(
                    "Feriados municipais/estaduais (--MM-DD todo ano ou AAAA-MM-DD, separados por vírgula)",
                  ),
                )}
                {field(
                  "bottle.types",
                  tr("Tipos de casco retornável (separados por vírgula)"),
                )}
              </Stack>
              <Divider sx={{ my: 3 }} />
              <Typography fontWeight={700} mb={2}>
                {tr("Recibo na impressora")}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField
                  select
                  label={tr("Imprimir ao finalizar a venda")}
                  value={values["receipt.autoPrint"] ?? "true"}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      "receipt.autoPrint": e.target.value,
                    })
                  }
                  sx={{ minWidth: 240 }}
                >
                  <MenuItem value="true">{tr("Sim, automaticamente")}</MenuItem>
                  <MenuItem value="false">{tr("Não, só no botão")}</MenuItem>
                </TextField>
                <TextField
                  select
                  label={tr("Vias")}
                  value={values["receipt.copies"] ?? "1"}
                  onChange={(e) =>
                    setValues({ ...values, "receipt.copies": e.target.value })
                  }
                  sx={{ minWidth: 120 }}
                >
                  {["1", "2", "3"].map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Divider sx={{ my: 3 }} />
              <Typography fontWeight={700} mb={1}>
                {tr("Taxas de pagamento (%)")}
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Custos da operação, descontados nos relatórios. Não são tributos
                fiscais e não aumentam o total cobrado do cliente.
              </Typography>
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}
              >
                {[
                  ["CREDIT", tr("Crédito")],
                  ["DEBIT", tr("Débito")],
                  ["PIX", "Pix"],
                  ["VOUCHER", tr("Vale")],
                  ["CASH", tr("Dinheiro")],
                  ["ACCOUNT", tr("Fiado")],
                ].map(([key, label]) => field("fee." + key, label, "number"))}
              </Box>
            </>
          )}
          <Button
            sx={{ mt: 3 }}
            variant="contained"
            startIcon={<SaveRounded />}
            disabled={isLoading}
            onClick={save}
          >
            {tr("Salvar ajustes")}
          </Button>
        </Paper>
      )}
      {tab === 1 && (
        <Stack gap={3}>
          <ScaleSettings />
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              mb={2}
            >
              <Typography fontWeight={700}>{tr("Impressoras")}</Typography>
              {admin && (
                <Button
                  startIcon={<AddRounded />}
                  onClick={() => setForm("printer")}
                >
                  {tr("Cadastrar")}
                </Button>
              )}
            </Stack>
            <Alert severity="info" sx={{ mb: 2 }}>
              {tr(
                "Recibos saem pela impressora padrão do Windows (Control iD, papel 80 mm). Instale o driver da Control iD e defina-a como padrão. Aberto pelo iniciar.bat, o sistema imprime direto, sem a janela de impressão.",
              )}
            </Alert>
            {printers.data?.map((p) => (
              <Stack
                key={p.id}
                direction="row"
                gap={2}
                alignItems="center"
                py={1}
              >
                <Box flex={1}>
                  <Typography>{p.name}</Typography>
                  <Typography variant="caption">
                    {p.connection} • {p.address}
                  </Typography>
                </Box>
                {admin && (
                  <Button
                    color="error"
                    onClick={async () => {
                      try {
                        await mutate("/printers/" + p.id, "DELETE");
                        notice(tr("Impressora removida"));
                      } catch (e) {
                        notice(errorMessage(e), "error");
                      }
                    }}
                  >
                    {tr("Remover")}
                  </Button>
                )}
              </Stack>
            ))}
          </Paper>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" mb={2}>
              <Typography fontWeight={700}>{tr("Balanças")}</Typography>
              {admin && (
                <Button
                  startIcon={<AddRounded />}
                  onClick={() => setForm("scale")}
                >
                  {tr("Cadastrar")}
                </Button>
              )}
            </Stack>
            <Alert severity="info" sx={{ mb: 2 }}>
              {tr(
                "Cadastro apenas para registro dos equipamentos. A leitura do peso é configurada no quadro Balança deste caixa, acima.",
              )}
            </Alert>
            {scales.data?.map((s) => (
              <Stack key={s.id} direction="row" py={1} alignItems="center">
                <Box flex={1}>
                  <Typography>{s.name}</Typography>
                  <Typography variant="caption">
                    {s.protocol} • {s.port}
                  </Typography>
                </Box>
                {admin && (
                  <Button
                    color="error"
                    onClick={async () => {
                      try {
                        await mutate("/scales/" + s.id, "DELETE");
                        notice(tr("Balança removida"));
                      } catch (e) {
                        notice(errorMessage(e), "error");
                      }
                    }}
                  >
                    {tr("Remover")}
                  </Button>
                )}
              </Stack>
            ))}
          </Paper>
        </Stack>
      )}
      {tab === 2 && admin && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography fontWeight={700}>
              {tr("Backup do banco de dados")}
            </Typography>
            <Button
              variant="contained"
              startIcon={<BackupRounded />}
              disabled={isLoading}
              onClick={async () => {
                try {
                  await mutate("/backup", "POST");
                  notice(tr("Backup criado com sucesso"));
                } catch (e) {
                  notice(errorMessage(e), "error");
                }
              }}
            >
              {isLoading ? tr("Processando…") : tr("Criar backup agora")}
            </Button>
          </Stack>
          <Alert severity="info" sx={{ mb: 2 }}>
            Backup automático diário às 03h (Brasília), com retenção padrão de
            14 dias. Copie os arquivos do volume para outro dispositivo. A
            restauração substitui os dados atuais e cria uma cópia de segurança
            antes.
          </Alert>
          {backups.data?.map((b) => (
            <Stack
              direction="row"
              gap={2}
              alignItems="center"
              py={1.5}
              key={b.filename}
            >
              <Box flex={1}>
                <Typography fontSize={14}>{b.filename}</Typography>
                <Typography variant="caption">
                  {new Date(b.createdAt).toLocaleString()} •{" "}
                  {(b.bytes / 1024).toFixed(1)} KB
                </Typography>
              </Box>
              <Button
                color="warning"
                startIcon={<RestoreRounded />}
                disabled={isLoading}
                onClick={() => setRestore(b.filename)}
              >
                {tr("Restaurar")}
              </Button>
            </Stack>
          ))}
          {!backups.data?.length && (
            <Typography color="text.secondary">
              {tr("Nenhum backup disponível. Crie o primeiro agora.")}
            </Typography>
          )}
        </Paper>
      )}
      {tab === 3 && admin && (
        <Stack gap={3}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" mb={2}>
              <Typography fontWeight={700}>{tr("Usuários")}</Typography>
              <Button
                startIcon={<AddRounded />}
                onClick={() => setForm("user")}
              >
                {tr("Novo usuário")}
              </Button>
            </Stack>
            {users.data?.map((u) => (
              <Stack
                key={u.id}
                direction="row"
                justifyContent="space-between"
                py={1}
              >
                <Typography>{u.username}</Typography>
                <Chip label={u.role} size="small" variant="outlined" />
              </Stack>
            ))}
          </Paper>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography fontWeight={700} mb={2}>
              {tr("Auditoria • últimas 100 ações")}
            </Typography>
            <Stack gap={2}>
              {logs.data?.content.map((l) => (
                <Box key={l.id}>
                  <Typography fontSize={13}>
                    <b>{l.actor}</b> • {l.action} • {l.entity} #{l.entityId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(l.createdAt).toLocaleString()} • {l.details}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Stack>
      )}
      {form && (
        <FormDialog
          title={
            form === "user"
              ? tr("Novo usuário")
              : form === "scale"
                ? tr("Cadastrar balança")
                : tr("Cadastrar impressora")
          }
          fields={fields[form]}
          initial={
            form === "user"
              ? { role: "CASHIER" }
              : form === "printer"
                ? { type: "BROWSER" }
                : { type: "MOCK" }
          }
          onClose={() => setForm(null)}
          onSave={async (v) => {
            await mutate(
              form === "user"
                ? "/users"
                : form === "scale"
                  ? "/scales"
                  : "/printers",
              "POST",
              v,
            );
            notice(tr("Cadastro salvo"));
          }}
        />
      )}
      {restore && (
        <FormDialog
          title={"Restaurar " + restore}
          fields={[
            {
              key: "confirmation",
              label: tr("Digite RESTAURAR para substituir o banco atual"),
              required: true,
              helper:
                "Pare outros terminais e réplicas do backend antes de continuar.",
            },
          ]}
          onClose={() => setRestore(null)}
          onSave={async (v) => {
            await mutate("/backup/restore", "POST", {
              filename: restore,
              confirmation: v.confirmation,
            });
            notice(
              "Banco restaurado. Entre novamente para atualizar a sessão.",
            );
          }}
        />
      )}
    </>
  );
}
