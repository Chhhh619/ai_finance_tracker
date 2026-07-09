import type { Transaction } from "../types";

// Symbols where Intl's narrow symbol is ambiguous ("$" for SGD) or not the
// form this app prefers. Everything else uses Intl's narrow symbol.
const SYMBOL_OVERRIDE: Record<string, string> = {
  MYR: "RM",
  SGD: "S$",
};

function currencySymbol(currency: string): string {
  const code = currency.toUpperCase();
  if (SYMBOL_OVERRIDE[code]) return SYMBOL_OVERRIDE[code];
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code; // invalid/unknown code — prefix with the code itself
  }
}

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function moneyFmt(amount: number, currency = "MYR"): string {
  const digits = currencyFractionDigits(currency);
  const num = amount.toLocaleString("en-MY", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${currencySymbol(currency)}${num}`;
}

export function formatTransactionAmount(
  amount: number,
  direction: Transaction["direction"],
  currency = "MYR",
): string {
  return `${direction === "income" ? "+" : "-"}${moneyFmt(amount, currency)}`;
}

export function getTransactionAmountClass(direction: Transaction["direction"]): string {
  return direction === "income" ? "text-emerald-600" : "text-rose-400";
}