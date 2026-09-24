import { tr } from "../i18n";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
export const NoticeContext = createContext<
  (message: string, severity?: "success" | "error" | "info") => void
>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function useDebounce<T>(value: T, delay = 140) {
  const [debounced, set] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => set(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
export function Loading() {
  return (
    <Box sx={{ p: 5, textAlign: "center" }}>
      <CircularProgress size={28} />
    </Box>
  );
}
export function Failure({ error }: { error?: unknown }) {
  return error ? (
    <Alert severity="error">
      Não foi possível carregar os dados. Verifique a conexão.
    </Alert>
  ) : null;
}
export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      gap={2}
      mb={3}
    >
      <Box>
        <Typography variant="h4" fontWeight={750}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" mt={0.6}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
export interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string | number; label: string }[];
  min?: number;
  step?: number;
  helper?: string;
}
export function FormDialog({
  title,
  fields,
  initial,
  onClose,
  onSave,
  header,
}: {
  title: string;
  header?: ReactNode;
  fields: Field[];
  initial?: Record<string, unknown>;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [values, set] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((f) => [f.key, String(initial?.[f.key] ?? "")]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(values);
            onClose();
          } catch (e) {
            setError((e as Error).message || tr("Erro ao salvar"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack gap={2} pt={1}>
            {error && <Alert severity="error">{error}</Alert>}
            {header}
            {fields.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                type={f.type || "text"}
                select={!!f.options}
                required={f.required}
                value={values[f.key]}
                onChange={(e) => set({ ...values, [f.key]: e.target.value })}
                helperText={f.helper}
                inputProps={{ min: f.min, step: f.step }}
                InputLabelProps={
                  f.type === "date" || f.type === "datetime-local"
                    ? { shrink: true }
                    : undefined
                }
              >
                {f.options?.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="contained" type="submit" disabled={busy}>
            {busy ? tr("Salvando…") : t("save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
