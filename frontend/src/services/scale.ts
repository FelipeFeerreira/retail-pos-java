// Leitura da balança Toledo Prix 8217 direto do navegador (Web Serial, Chrome/Edge).
// O Docker no Windows não enxerga portas COM, por isso a leitura acontece no computador
// do caixa. A configuração fica no navegador de cada terminal, pois a balança é local.

export type Protocol = "P05A" | "P05" | "P06" | "GENERIC";
export type SimState = "ok" | "unstable" | "zero" | "disconnected";
export interface ScaleConfig {
  mode: "off" | "serial" | "simulation";
  protocol: Protocol;
  simWeight: number;
  simState: SimState;
}
export type Reading =
  | { kind: "weight"; kg: number }
  | { kind: "unstable" | "negative" | "overload" };

/** Erro com motivo, para a tela mostrar a mensagem certa ao operador. */
export class ScaleError extends Error {
  constructor(
    public reason:
      | "disconnected"
      | "unstable"
      | "zero"
      | "overload"
      | "negative"
      | "unsupported",
    message: string,
  ) {
    super(message);
  }
}

// Velocidade de cada protocolo, igual ao sistema anterior em Python.
export const PROTOCOLS: Record<
  Protocol,
  { label: string; baudRate: number; onDemand: boolean }
> = {
  P05A: {
    label: "P05A (Toledo Prix 8217) • 9600",
    baudRate: 9600,
    onDemand: true,
  },
  P05: {
    label: "P05 (Toledo Prix 8217) • 2400",
    baudRate: 2400,
    onDemand: true,
  },
  P06: {
    label: "P06 (Toledo Prix 8217) • 9600",
    baudRate: 9600,
    onDemand: false,
  },
  GENERIC: {
    label: "Genérico contínuo • 9600",
    baudRate: 9600,
    onDemand: false,
  },
};

const KEY = "sistemajava.scale";
const DEFAULT: ScaleConfig = {
  mode: "off",
  protocol: "P05A",
  simWeight: 0.75,
  simState: "ok",
};

export function loadConfig(): ScaleConfig {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULT };
  }
}
export function saveConfig(config: ScaleConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* Armazenamento indisponível: vale só nesta sessão. */
  }
}

/** Texto de P06/genérico, ex.: "  0,750 kg" ou "750 g". */
export function parseText(text: string): number | null {
  const s = text.trim().replace(/;/g, " ");
  const withUnit = [
    ...s.matchAll(/([-+]?\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gr)\b/gi),
  ];
  if (withUnit.length) {
    const [, number, unit] = withUnit[withUnit.length - 1];
    const value = Number(number.replace(",", "."));
    return unit.toLowerCase().startsWith("g") ? value / 1000 : value;
  }
  const numbers = s.match(/[-+]?\d+(?:[.,]\d+)?/g);
  return numbers && numbers.length === 1
    ? Number(numbers[0].replace(",", "."))
    : null;
}

/**
 * Extrai leituras do buffer serial. P05/P05A: STX + 5 caracteres + ETX, dois inteiros e três
 * decimais ("00750" = 0,750 kg); "I" = instável, "N" = negativo, "S" = acima da capacidade.
 * Devolve as leituras completas e o que sobrou do buffer (pacote ainda incompleto).
 */
export function parseBuffer(buffer: number[]): {
  readings: Reading[];
  rest: number[];
} {
  const readings: Reading[] = [];
  let data = buffer.slice(-256);
  for (;;) {
    const start = data.indexOf(0x02);
    if (start < 0) {
      const value = parseText(String.fromCharCode(...data));
      if (value !== null && /\r|\n/.test(String.fromCharCode(...data))) {
        readings.push({ kind: "weight", kg: Math.max(0, value) });
        return { readings, rest: [] };
      }
      return { readings, rest: data };
    }
    let end = data.indexOf(0x03, start + 1);
    if (end < 0) end = data.indexOf(0x0d, start + 1);
    if (end < 0) return { readings, rest: data.slice(start) };
    const body = String.fromCharCode(...data.slice(start + 1, end)).trim();
    data = data.slice(end + 1);
    if (!body) continue;
    if (body[0] === "I") readings.push({ kind: "unstable" });
    else if (body[0] === "N") readings.push({ kind: "negative" });
    else if (body[0] === "S") readings.push({ kind: "overload" });
    else if (/^\d{5}$/.test(body))
      readings.push({
        kind: "weight",
        kg: Number(body.slice(0, 2)) + Number(body.slice(2)) / 1000,
      });
    else {
      const value = parseText(body);
      if (value !== null)
        readings.push({ kind: "weight", kg: Math.max(0, value) });
    }
  }
}

interface SerialPortLike {
  open(options: {
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
  }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}
const serialApi = () =>
  (navigator as unknown as { serial?: SerialLike }).serial;
export const serialSupported = () => !!serialApi();

/** Leitor contínuo: mantém a porta aberta e guarda a última leitura. */
class SerialScale {
  private port: SerialPortLike | null = null;
  private protocol: Protocol = "P05A";
  private last: { reading: Reading; at: number } | null = null;
  private previousWeight: number | null = null;
  private stableSince = 0;
  private running = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  get connected() {
    return !!this.port && this.running;
  }

  /** Pede ao operador para escolher a porta COM (precisa de clique). */
  async authorize(protocol: Protocol) {
    const api = serialApi();
    if (!api)
      throw new ScaleError(
        "unsupported",
        "Este navegador não acessa portas COM. Use o Chrome ou o Edge.",
      );
    await this.close();
    await this.open(await api.requestPort(), protocol);
  }

  /** Reabre a porta já autorizada antes, sem pedir de novo. */
  async ensure(protocol: Protocol) {
    if (this.connected && this.protocol === protocol) return;
    const api = serialApi();
    if (!api)
      throw new ScaleError(
        "unsupported",
        "Este navegador não acessa portas COM. Use o Chrome ou o Edge.",
      );
    const [port] = await api.getPorts();
    if (!port)
      throw new ScaleError(
        "disconnected",
        "Balança não autorizada. Em Ajustes → Equipamentos, clique em Conectar balança.",
      );
    await this.close();
    await this.open(port, protocol);
  }

  private async open(port: SerialPortLike, protocol: Protocol) {
    try {
      await port.open({
        baudRate: PROTOCOLS[protocol].baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
      });
    } catch (e) {
      throw new ScaleError(
        "disconnected",
        "Não foi possível abrir a porta da balança: " + (e as Error).message,
      );
    }
    this.port = port;
    this.protocol = protocol;
    this.running = true;
    void this.readLoop();
    if (PROTOCOLS[protocol].onDemand) void this.requestLoop();
  }

  async close() {
    this.running = false;
    const port = this.port;
    this.port = null;
    this.last = null;
    // A porta só fecha depois de cancelar a leitura em andamento.
    try {
      await this.reader?.cancel();
    } catch {
      /* Leitor já encerrado. */
    }
    await wait(50);
    if (port)
      try {
        await port.close();
      } catch {
        /* Já fechada ou desconectada. */
      }
  }

  // P05/P05A respondem sob demanda: envia ENQ (0x05) a cada 300 ms.
  private async requestLoop() {
    while (this.running && this.port?.writable) {
      try {
        const writer = this.port.writable.getWriter();
        await writer.write(new Uint8Array([0x05]));
        writer.releaseLock();
      } catch {
        await this.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  private async readLoop() {
    let buffer: number[] = [];
    while (this.running && this.port?.readable) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseBuffer([...buffer, ...value]);
          buffer = parsed.rest;
          for (const reading of parsed.readings) this.record(reading);
        }
      } catch {
        // Cabo solto ou porta fechada: a próxima leitura reporta desconectada.
        await this.close();
      } finally {
        reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private record(reading: Reading) {
    const now = Date.now();
    // Nos protocolos contínuos sem aviso de instabilidade, estável = mesmo peso por 600 ms.
    if (reading.kind === "weight") {
      if (this.previousWeight !== reading.kg) this.stableSince = now;
      this.previousWeight = reading.kg;
    } else this.previousWeight = null;
    this.last = { reading, at: now };
  }

  current(): { reading: Reading; stable: boolean } | null {
    if (!this.last || Date.now() - this.last.at > 1500) return null;
    const onDemand = PROTOCOLS[this.protocol].onDemand;
    const stable =
      this.last.reading.kind === "weight" &&
      (onDemand || Date.now() - this.stableSince >= 600);
    return { reading: this.last.reading, stable };
  }
}

const serialScale = new SerialScale();
export const authorizeScale = (protocol: Protocol) =>
  serialScale.authorize(protocol);
export const disconnectScale = () => serialScale.close();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mensagens para cada situação, iguais no modo real e no simulado. */
const errors = {
  disconnected: () =>
    new ScaleError(
      "disconnected",
      "Balança desconectada. Confira o cabo e a energia.",
    ),
  unstable: () =>
    new ScaleError(
      "unstable",
      "Peso instável. Espere o produto parar na balança.",
    ),
  zero: () =>
    new ScaleError("zero", "Peso zero. Coloque o produto na balança."),
  overload: () =>
    new ScaleError("overload", "Peso acima da capacidade da balança."),
  negative: () =>
    new ScaleError(
      "negative",
      "Peso negativo. Tire o produto e zere a balança.",
    ),
};

/**
 * Lê um peso estável maior que zero. Espera até `timeoutMs` pela estabilização e
 * rejeita com ScaleError explicando o motivo.
 */
export async function readStableWeight(
  config = loadConfig(),
  timeoutMs = 4000,
): Promise<number> {
  if (config.mode === "off")
    throw new ScaleError("unsupported", "Balança desligada em Ajustes.");
  if (config.mode === "simulation") {
    await wait(300);
    if (config.simState !== "ok") throw errors[config.simState]();
    if (!(config.simWeight > 0)) throw errors.zero();
    return Math.round(config.simWeight * 1000) / 1000;
  }
  await serialScale.ensure(config.protocol);
  const deadline = Date.now() + timeoutMs;
  let lastSeen: Reading | null = null;
  while (Date.now() < deadline) {
    const now = serialScale.current();
    if (now) {
      lastSeen = now.reading;
      if (now.reading.kind === "overload") throw errors.overload();
      if (now.reading.kind === "weight" && now.stable && now.reading.kg > 0)
        return Math.round(now.reading.kg * 1000) / 1000;
    }
    await wait(150);
  }
  if (!lastSeen) throw errors.disconnected();
  if (lastSeen.kind === "weight")
    throw lastSeen.kg <= 0 ? errors.zero() : errors.unstable();
  if (lastSeen.kind === "negative") throw errors.negative();
  throw errors.unstable();
}

/** Situação atual da balança para o painel do operador (não abre a porta sozinho). */
export function scaleStatus(): {
  mode: ScaleConfig["mode"];
  connected: boolean;
  kg: number | null;
  stable: boolean;
} {
  const config = loadConfig();
  if (config.mode === "simulation")
    return {
      mode: "simulation",
      connected: config.simState !== "disconnected",
      kg: config.simState === "zero" ? 0 : config.simWeight,
      stable: config.simState === "ok",
    };
  if (config.mode === "off")
    return { mode: "off", connected: false, kg: null, stable: false };
  const now = serialScale.current();
  return {
    mode: "serial",
    connected: serialScale.connected,
    kg: now?.reading.kind === "weight" ? now.reading.kg : null,
    stable: !!now?.stable,
  };
}

/** Reabre a porta autorizada antes, para o mostrador de peso funcionar ao entrar no caixa. */
export async function connectAuthorizedScale() {
  const config = loadConfig();
  if (config.mode !== "serial") return;
  try {
    await serialScale.ensure(config.protocol);
  } catch {
    /* Sem porta autorizada: o painel mostra "desconectada". */
  }
}
