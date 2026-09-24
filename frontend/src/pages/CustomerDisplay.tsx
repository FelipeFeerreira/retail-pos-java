import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { ShoppingBasketRounded, StorefrontRounded } from "@mui/icons-material";
import { money, qty } from "../utils";

export interface DisplayState {
  store: string;
  items: { name: string; unit: string; quantity: number; total: number }[];
  total: number;
  thanks?: number;
  /** Formas escolhidas, valor recebido em dinheiro e troco. */
  payment?: {
    payments: { method: string; amount: number }[];
    tender: number;
    change: number;
  };
}
export const DISPLAY_CHANNEL = "sistemajava-customer-display";

/** Publishes the checkout state to the customer-facing window. */
export function publishDisplay(state: DisplayState) {
  try {
    const channel = new BroadcastChannel(DISPLAY_CHANNEL);
    channel.postMessage(state);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable: the display simply stays idle. */
  }
}

/** Second screen facing the customer: items, total and a thank-you after payment. */
export default function CustomerDisplay() {
  const [state, setState] = useState<DisplayState | null>(null);
  useEffect(() => {
    document.title = "Tela do cliente";
    const channel = new BroadcastChannel(DISPLAY_CHANNEL);
    channel.onmessage = (event) => setState(event.data as DisplayState);
    return () => channel.close();
  }, []);
  const idle = !state || (!state.items.length && state.thanks === undefined);
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0b3d2e",
        color: "white",
        display: "flex",
        flexDirection: "column",
        p: { xs: 3, md: 6 },
      }}
    >
      <Stack direction="row" alignItems="center" gap={2} mb={4}>
        <StorefrontRounded sx={{ fontSize: 48, color: "#7ee2b8" }} />
        <Typography variant="h4" fontWeight={800}>
          {state?.store || "Bem-vindo!"}
        </Typography>
      </Stack>
      {state?.thanks !== undefined ? (
        <Stack flex={1} alignItems="center" justifyContent="center" gap={2}>
          <Typography variant="h2" fontWeight={800}>
            Obrigado pela preferência!
          </Typography>
          <Typography variant="h4" color="#bae4d5">
            Total pago: {money(state.thanks)}
          </Typography>
          {!!state.payment?.change && (
            <Typography variant="h2" fontWeight={900} color="#ffd166">
              Troco: {money(state.payment.change)}
            </Typography>
          )}
        </Stack>
      ) : idle ? (
        <Stack flex={1} alignItems="center" justifyContent="center" gap={2}>
          <ShoppingBasketRounded sx={{ fontSize: 96, opacity: 0.4 }} />
          <Typography variant="h3" fontWeight={700}>
            Caixa livre
          </Typography>
        </Stack>
      ) : (
        <>
          <Box sx={{ flex: 1, overflowY: "auto" }}>
            {state!.items.map((item, index) => (
              <Stack
                key={index}
                direction="row"
                py={1.6}
                sx={{ borderBottom: "1px solid rgba(255,255,255,.15)" }}
              >
                <Typography fontSize={26} flex={1}>
                  {item.name}
                </Typography>
                <Typography fontSize={22} color="#bae4d5" mr={4}>
                  {qty(item.quantity)} {item.unit}
                </Typography>
                <Typography fontSize={26} fontWeight={700}>
                  {money(item.total)}
                </Typography>
              </Stack>
            ))}
          </Box>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mt={3}
            pt={3}
            sx={{ borderTop: "2px solid #7ee2b8" }}
          >
            <Typography variant="h3" fontWeight={700}>
              TOTAL
            </Typography>
            <Typography variant="h1" fontWeight={900} color="#7ee2b8">
              {money(state!.total)}
            </Typography>
          </Stack>
          {!!state!.payment?.change && (
            <Stack direction="row" justifyContent="space-between" mt={2}>
              <Typography variant="h4" color="#bae4d5">
                Recebido: {money(state!.payment.tender)}
              </Typography>
              <Typography variant="h2" fontWeight={900} color="#ffd166">
                Troco: {money(state!.payment.change)}
              </Typography>
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
