import { tr } from "../i18n";
import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { DownloadRounded, UploadFileRounded } from "@mui/icons-material";
import { useData, useSendMutation } from "../store";
import { errorMessage, money } from "../utils";
import { Failure, Loading, useNotice } from "../components/Common";
import { download } from "../services/download";

interface Pending {
  id: number;
  code: string;
  barcode: string | null;
  name: string;
  unit: string;
  price: number;
  categoryName: string | null;
}

/** Custos pendentes: sem custo, lucro, DRE e preço sugerido ficam errados. */
export default function Costs() {
  const pending = useData<Pending[]>("/products/costs/pending");
  const [filter, setFilter] = useState("");
  const [send] = useSendMutation();
  const notice = useNotice();
  const file = useRef<HTMLInputElement>(null);
  const list = (pending.data || []).filter(
    (p) =>
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.code.includes(filter) ||
      p.barcode?.includes(filter),
  );
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {tr(
          'Produtos sem custo deixam o lucro, a DRE e o preço sugerido errados. Baixe a planilha, preencha a coluna amarela "custo" (e "preco_venda" se quiser mudar o preço) e importe de volta. Ou digite o custo direto na lista abaixo.',
        )}
      </Alert>
      <Stack direction="row" gap={1} mb={2} flexWrap="wrap" alignItems="center">
        <Chip
          color={pending.data?.length ? "warning" : "success"}
          label={`${pending.data?.length ?? "…"} ${tr("produtos sem custo")}`}
        />
        <Box flex={1} />
        <Button
          startIcon={<DownloadRounded />}
          onClick={() =>
            download(
              "/products/costs/template?onlyMissing=true",
              "custos-pendentes.xlsx",
            ).catch(() => notice(tr("Falha ao exportar"), "error"))
          }
        >
          {tr("Planilha dos sem custo")}
        </Button>
        <Button
          startIcon={<DownloadRounded />}
          onClick={() =>
            download(
              "/products/costs/template?onlyMissing=false",
              "custos-todos.xlsx",
            ).catch(() => notice(tr("Falha ao exportar"), "error"))
          }
        >
          {tr("Planilha de todos")}
        </Button>
        <Button
          variant="contained"
          startIcon={<UploadFileRounded />}
          onClick={() => file.current?.click()}
        >
          {tr("Importar planilha preenchida")}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".xlsx,.csv"
          hidden
          onChange={async (e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (!chosen) return;
            const body = new FormData();
            body.append("file", chosen);
            try {
              const result = (await send({
                url: "/products/costs/import",
                method: "POST",
                body,
              }).unwrap()) as { updated: number; skipped: number };
              notice(
                `${result.updated} ${tr("produtos atualizados")} • ${result.skipped} ${tr("linhas sem custo ignoradas")}`,
              );
            } catch (err) {
              notice(errorMessage(err), "error");
            }
          }}
        />
      </Stack>
      <TextField
        size="small"
        placeholder={tr("Filtrar por nome ou código")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 1.5, width: 320 }}
      />
      <Failure error={pending.error} />
      <Paper variant="outlined" sx={{ overflowX: "auto", maxHeight: 520 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>{tr("Produto")}</TableCell>
              <TableCell>{tr("Categoria")}</TableCell>
              <TableCell align="right">{tr("Preço de venda")}</TableCell>
              <TableCell>{tr("Custo (Enter salva)")}</TableCell>
              <TableCell>{tr("Lucro na venda")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.slice(0, 300).map((p) => (
              <CostRow key={p.id} product={p} />
            ))}
          </TableBody>
        </Table>
        {pending.isLoading && <Loading />}
        {!pending.isLoading && !pending.data?.length && (
          <Alert severity="success">
            {tr("Todos os produtos ativos têm custo cadastrado.")}
          </Alert>
        )}
        {list.length > 300 && (
          <Typography fontSize={12} color="text.secondary" p={1.5}>
            {tr("Mostrando 300. Use o filtro ou a planilha para os demais.")}
          </Typography>
        )}
      </Paper>
    </>
  );
}

function CostRow({ product }: { product: Pending }) {
  const [value, setValue] = useState("");
  const saved = useRef("");
  const [send, { isLoading }] = useSendMutation();
  const notice = useNotice();
  const cost = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && cost > 0;
  const margin = valid
    ? ((Number(product.price) - cost) / Number(product.price)) * 100
    : null;
  const save = async () => {
    if (!valid || isLoading || saved.current === value) return;
    saved.current = value;
    try {
      await send({
        url: `/products/${product.id}/cost`,
        method: "PATCH",
        body: { cost },
      }).unwrap();
      notice(`${product.name}: ${tr("custo salvo")}`);
    } catch (e) {
      saved.current = "";
      notice(errorMessage(e), "error");
    }
  };
  return (
    <TableRow hover>
      <TableCell>
        {product.name}
        <Typography variant="caption" color="text.secondary" display="block">
          #{product.code} • {product.unit}
        </Typography>
      </TableCell>
      <TableCell>{product.categoryName || "—"}</TableCell>
      <TableCell align="right">{money(product.price)}</TableCell>
      <TableCell>
        <TextField
          size="small"
          placeholder="0,00"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          onBlur={() => void save()}
          inputProps={{
            inputMode: "decimal",
            "aria-label": "Custo " + product.name,
          }}
          sx={{ width: 110 }}
        />
      </TableCell>
      <TableCell>
        {margin !== null && (
          <Chip
            size="small"
            variant="outlined"
            color={margin <= 0 ? "error" : margin < 15 ? "warning" : "success"}
            label={margin <= 0 ? tr("PREJUÍZO") : margin.toFixed(1) + "%"}
          />
        )}
      </TableCell>
    </TableRow>
  );
}
