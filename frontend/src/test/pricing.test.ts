import { roundUp, suggestPrice } from "../utils";

test("ends9 always rounds up to a price ending in 9", () => {
  expect(roundUp(7.23)).toBe(7.29);
  expect(roundUp(7.29)).toBe(7.29);
  expect(roundUp(10)).toBe(10.09);
  expect(roundUp(0)).toBe(0);
});

test("step rounding never lowers the price", () => {
  expect(roundUp(7.21, "0.05")).toBe(7.25);
  expect(roundUp(7.2, "0.10")).toBe(7.2);
  expect(roundUp(7.21, "0.10")).toBe(7.3);
  expect(roundUp(7.215, "0.01")).toBe(7.22);
});

test("suggested price applies markup over cost and shows profit on the sale", () => {
  const s = suggestPrice(10, 40, "0.01", 2.5);
  expect(s.price).toBe(14);
  expect(s.profit).toBe(4);
  expect(s.profitPct).toBeCloseTo(28.57, 2);
  expect(s.cardProfitPct).toBeCloseTo(26.07, 2);
  expect(suggestPrice(0, 30).price).toBe(0);
});
