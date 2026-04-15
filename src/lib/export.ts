import * as XLSX from "xlsx";
import type { Transaction } from "../types";

type ExportRow = {
  Date: string;
  Time: string;
  Merchant: string;
  Amount: number;
  Direction: string;
  Category: string;
  Source: string;
};

function toRows(txns: Transaction[]): ExportRow[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  return txns.map((t) => {
    const d = new Date(t.transaction_at);
    return {
      Date: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}`,
      Time: `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`,
      Merchant: t.merchant,
      Amount: Number(t.amount),
      Direction: t.direction,
      Category: t.category?.name ?? "",
      Source: t.source,
    };
  });
}

export function exportTransactionsXLSX(txns: Transaction[], filename: string): void {
  const rows = toRows(txns);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, filename);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportTransactionsCSV(txns: Transaction[], filename: string): void {
  const rows = toRows(txns);
  const headers: (keyof ExportRow)[] = ["Date", "Time", "Merchant", "Amount", "Direction", "Category", "Source"];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(ext: "xlsx" | "csv"): string {
  return `pocketringgit-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
