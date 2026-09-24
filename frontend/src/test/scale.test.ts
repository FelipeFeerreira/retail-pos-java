import {
  parseBuffer,
  parseText,
  readStableWeight,
  ScaleError,
} from "../services/scale";

const bytes = (text: string) => [...text].map((c) => c.charCodeAt(0));

describe("protocolo Toledo P05/P05A", () => {
  test("lê STX + 5 dígitos + ETX como quilos com três decimais", () => {
    expect(parseBuffer(bytes("\x0200750\x03")).readings).toEqual([
      { kind: "weight", kg: 0.75 },
    ]);
    expect(parseBuffer(bytes("\x0212345\x03")).readings).toEqual([
      { kind: "weight", kg: 12.345 },
    ]);
  });
  test("identifica instável, negativo e sobrecarga", () => {
    expect(
      parseBuffer(bytes("\x02IIIII\x03\x02NNNNN\x03\x02SSSSS\x03")).readings,
    ).toEqual([
      { kind: "unstable" },
      { kind: "negative" },
      { kind: "overload" },
    ]);
  });
  test("guarda pacote que chegou pela metade", () => {
    const first = parseBuffer(bytes("\x02007"));
    expect(first.readings).toEqual([]);
    expect(parseBuffer([...first.rest, ...bytes("50\x03")]).readings).toEqual([
      { kind: "weight", kg: 0.75 },
    ]);
  });
  test("aceita P06/genérico em texto", () => {
    expect(parseText(" 1,250 kg")).toBe(1.25);
    expect(parseText("750 g")).toBe(0.75);
    expect(parseBuffer(bytes("\x02 0.500\r")).readings).toEqual([
      { kind: "weight", kg: 0.5 },
    ]);
  });
});

describe("modo simulação", () => {
  const base = {
    mode: "simulation" as const,
    protocol: "P05A" as const,
    simWeight: 0.75,
  };
  test("devolve o peso simulado", async () => {
    await expect(readStableWeight({ ...base, simState: "ok" })).resolves.toBe(
      0.75,
    );
  });
  test.each(["unstable", "zero", "disconnected"] as const)(
    "simula erro %s",
    async (state) => {
      const error = await readStableWeight({ ...base, simState: state }).catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(ScaleError);
      expect((error as ScaleError).reason).toBe(state);
    },
  );
  test("peso zero digitado também é recusado", async () => {
    const error = await readStableWeight({
      ...base,
      simState: "ok",
      simWeight: 0,
    }).catch((e) => e);
    expect((error as ScaleError).reason).toBe("zero");
  });
});
