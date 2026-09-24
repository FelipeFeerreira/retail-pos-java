// Leitura de boletos: linha digitável (47 dígitos bancário, 48 convênio/concessionária)
// ou código de barras (44 dígitos). Confere os dígitos verificadores e, quando o boleto
// traz essa informação, extrai o valor e o vencimento.

export interface Boleto {
  valid: boolean;
  kind?: "BANK" | "UTILITY";
  digits: string;
  amount?: number;
  dueDate?: string;
  error?: string;
}

/** Módulo 10: pesos 2,1,2,1... da direita para a esquerda, somando os dígitos dos produtos. */
export function mod10(block: string) {
  let sum = 0;
  let weight = 2;
  for (let i = block.length - 1; i >= 0; i--) {
    const product = Number(block[i]) * weight;
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

/** Módulo 11 do boleto bancário: pesos 2 a 9; resultado 0, 10 ou 11 vira 1. */
export function mod11Bank(block: string) {
  let sum = 0;
  let weight = 2;
  for (let i = block.length - 1; i >= 0; i--) {
    sum += Number(block[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 11 de convênio: resto 0 ou 1 vira 0; resto 10 vira 1 (FEBRABAN). */
function mod11Utility(block: string) {
  let sum = 0;
  let weight = 2;
  for (let i = block.length - 1; i >= 0; i--) {
    sum += Number(block[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest === 0 || rest === 1 ? 0 : rest === 10 ? 1 : 11 - rest;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Fator de vencimento: dias desde 07/10/1997. Ao chegar a 9999 (21/02/2025) ele recomeçou
 * em 1000 a partir de 22/02/2025. Zero = boleto sem vencimento.
 */
export function dueFromFactor(factor: number): string | undefined {
  if (!factor) return undefined;
  const day = 86400000;
  const restart = Date.UTC(2025, 1, 22);
  const old = Date.UTC(1997, 9, 7) + factor * day;
  // Datas do ciclo antigo anteriores ao recomeço pertencem ao ciclo novo.
  return iso(new Date(old >= restart ? old : restart + (factor - 1000) * day));
}

function bankFromBarcode(code: string): Boleto {
  const body = code.slice(0, 4) + code.slice(5);
  if (mod11Bank(body) !== Number(code[4]))
    return {
      valid: false,
      digits: code,
      error: "Dígito verificador geral inválido",
    };
  const amount = Number(code.slice(9, 19)) / 100;
  return {
    valid: true,
    kind: "BANK",
    digits: code,
    amount: amount || undefined,
    dueDate: dueFromFactor(Number(code.slice(5, 9))),
  };
}

function utilityFromBarcode(code: string): Boleto {
  const byValue = code[2];
  const check = byValue === "6" || byValue === "7" ? mod10 : mod11Utility;
  if (check(code.slice(0, 3) + code.slice(4)) !== Number(code[3]))
    return {
      valid: false,
      digits: code,
      error: "Dígito verificador geral inválido",
    };
  // Identificador 6 ou 8: valor efetivo em reais nas posições 5 a 15.
  const amount =
    byValue === "6" || byValue === "8" ? Number(code.slice(4, 15)) / 100 : 0;
  return {
    valid: true,
    kind: "UTILITY",
    digits: code,
    amount: amount || undefined,
  };
}

export function parseBoleto(text: string): Boleto {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 44)
    return digits[0] === "8"
      ? utilityFromBarcode(digits)
      : bankFromBarcode(digits);
  if (digits.length === 47) {
    // Campos 1, 2 e 3 têm DV próprio (módulo 10).
    const fields: [number, number][] = [
      [0, 9],
      [10, 20],
      [21, 31],
    ];
    for (const [start, dv] of fields)
      if (mod10(digits.slice(start, dv)) !== Number(digits[dv]))
        return {
          valid: false,
          digits,
          error: "Linha digitável com dígito errado",
        };
    const barcode =
      digits.slice(0, 4) +
      digits[32] +
      digits.slice(33, 47) +
      digits.slice(4, 9) +
      digits.slice(10, 20) +
      digits.slice(21, 31);
    return { ...bankFromBarcode(barcode), digits };
  }
  if (digits.length === 48 && digits[0] === "8") {
    const byValue = digits[2];
    const check = byValue === "6" || byValue === "7" ? mod10 : mod11Utility;
    for (let block = 0; block < 4; block++) {
      const part = digits.slice(block * 12, block * 12 + 11);
      if (check(part) !== Number(digits[block * 12 + 11]))
        return {
          valid: false,
          digits,
          error: "Linha digitável com dígito errado",
        };
    }
    const barcode = [0, 1, 2, 3]
      .map((b) => digits.slice(b * 12, b * 12 + 11))
      .join("");
    return { ...utilityFromBarcode(barcode), digits };
  }
  return {
    valid: false,
    digits,
    error: digits.length
      ? "Informe 47 ou 48 dígitos (ou os 44 do código de barras)"
      : undefined,
  };
}
