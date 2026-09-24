export const money = (value: number | string | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );
export const qty = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(
    Number(value),
  );
export function lineTotal(price: number, quantity: number, discount: number) {
  return (
    Math.round(Number(price) * 100 * quantity + 1e-7) -
    Math.round(discount * 100)
  );
}
export function parseScan(text: string): { query: string; quantity: number } {
  const match = text.trim().match(/^(.*?)\s*[xX]\s*(\d+(?:[.,]\d{1,3})?)$/);
  if (match)
    return {
      query: match[1].trim(),
      quantity: Number(match[2].replace(",", ".")),
    };
  return { query: text.trim(), quantity: 1 };
}
/** Verdadeiro quando o operador digitou a quantidade ("código x 0,750"). */
export const hasQuantity = (text: string) =>
  /[xX]\s*\d+(?:[.,]\d{1,3})?$/.test(text.trim());
export const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
export const errorMessage = (error: unknown) => {
  const e = error as { data?: { message?: string }; message?: string };
  return (
    e?.data?.message ||
    e?.message ||
    "Não foi possível concluir. Verifique a conexão e tente novamente."
  );
};
export type Rounding = "ends9" | "0.05" | "0.10" | "0.01";
/** Rounds a price up, never down: "ends9" turns 7,23 into 7,29 and 10,00 into 10,09. */
export function roundUp(value: number, mode: Rounding = "ends9") {
  const cents = Math.round(Math.max(0, value) * 100);
  if (cents === 0) return 0;
  if (mode === "ends9") {
    let candidate = Math.ceil(cents / 10) * 10 - 1;
    if (candidate < cents) candidate += 10;
    return candidate / 100;
  }
  const step = Math.round(Number(mode) * 100);
  return (Math.ceil(cents / step) * step) / 100;
}
/** Suggested sale price = cost + markup % over cost, rounded up; with profit indicators. */
export function suggestPrice(
  cost: number,
  markup: number,
  mode: Rounding = "ends9",
  cardFee = 0,
) {
  const price = roundUp(cost * (1 + markup / 100), mode);
  const profit = Math.round((price - cost) * 100) / 100;
  return {
    price,
    profit,
    profitPct: price ? (profit / price) * 100 : 0,
    cardProfitPct: price
      ? ((price * (1 - cardFee / 100) - cost) / price) * 100
      : 0,
  };
}
