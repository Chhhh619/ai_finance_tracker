import type { Transaction } from "../types";

export function moneyFmt(n: number): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTransactionAmount(amount: number, direction: Transaction["direction"]): string {
  return `${direction === "income" ? "+" : "-"}${moneyFmt(amount)}`;
}

export function getTransactionAmountClass(direction: Transaction["direction"]): string {
  return direction === "income" ? "text-emerald-600" : "text-rose-400";
}