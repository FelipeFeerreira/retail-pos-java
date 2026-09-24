import {
  parseScan,
  lineTotal,
  money,
  qty,
  errorMessage,
  today,
} from "../utils";
describe("scanner and money", () => {
  test.each([
    ["001 x 3", "001", 3],
    ["789 X 0,750", "789", 0.75],
    [" arroz ", "arroz", 1],
    ["123", "123", 1],
    ["banana x 1.250", "banana", 1.25],
  ])("parses %s", (text, query, quantity) =>
    expect(parseScan(text)).toEqual({ query, quantity }),
  );
  test.each([
    [6.99, 0.75, 0, 524],
    [24.9, 3, 2, 7270],
    [0.01, 0.5, 0, 1],
    [2.5, 2, 5, 0],
  ])("rounds line in integer cents", (price, q, discount, total) =>
    expect(lineTotal(price, q, discount)).toBe(total),
  );
  test("formats Brazilian amounts", () => {
    expect(money(12.5)).toContain("12,50");
    expect(qty(1.75)).toBe("1,75");
    expect(money(undefined)).toContain("0,00");
  });
  test("renders errors safely", () => {
    expect(errorMessage({ data: { message: "Estoque insuficiente" } })).toBe(
      "Estoque insuficiente",
    );
    expect(errorMessage(new Error("Falha"))).toBe("Falha");
    expect(errorMessage(null)).toContain("conexão");
  });
  test("uses local calendar date", () =>
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
});
