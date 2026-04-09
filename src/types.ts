export type EntrySource = "notification" | "receipt" | "manual" | "shortcut";

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  custom?: boolean;
}

export interface ParsedTransaction {
  merchant: string;
  description: string;
  amount: number;
  categoryName?: string;
  timestamp?: string;
  confidence?: number;
}

export interface ExpenseEntry {
  id: string;
  source: EntrySource;
  merchant: string;
  description: string;
  amount: number;
  currency: "MYR";
  categoryId: string;
  categoryName: string;
  timestamp: string;
  rawText: string;
  confidence: number;
}
