import {
  dueFromFactor,
  mod10,
  mod11Bank,
  parseBoleto,
} from "../services/boleto";

// Exemplo público do Banco do Brasil: 00190.50095 40144.816069 06809.350314 3 37370000000100
const BB = "00190.50095 40144.816069 06809.350314 3 37370000000100";

describe("boletos", () => {
  test("módulo 10 dos campos da linha digitável", () => {
    expect(mod10("001905009")).toBe(5);
    expect(mod10("4014481606")).toBe(9);
    expect(mod10("0680935031")).toBe(4);
  });
  test("lê a linha digitável bancária com valor", () => {
    const b = parseBoleto(BB);
    expect(b.valid).toBe(true);
    expect(b.kind).toBe("BANK");
    expect(b.amount).toBe(1);
  });
  test("recusa dígito digitado errado", () => {
    expect(parseBoleto(BB.replace("50095", "50096")).valid).toBe(false);
    expect(parseBoleto("123").valid).toBe(false);
  });
  test("fator de vencimento no ciclo novo (a partir de 22/02/2025)", () => {
    expect(dueFromFactor(1000)).toBe("2025-02-22");
    expect(dueFromFactor(1001)).toBe("2025-02-23");
    expect(dueFromFactor(0)).toBeUndefined();
  });
  test("código de barras bancário de 44 dígitos confere o DV geral", () => {
    const body = "0019" + "10000000000100" + "0500940144816060680935031";
    const code = body.slice(0, 4) + mod11Bank(body) + body.slice(4);
    const b = parseBoleto(code);
    expect(b.valid).toBe(true);
    expect(b.amount).toBe(1);
    expect(b.dueDate).toBe("2025-02-22");
  });
});
