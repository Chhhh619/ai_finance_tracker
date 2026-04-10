export type TransactionDirection = "expense" | "income";
export type TransactionSource = "ewallet" | "bank" | "manual" | "receipt";
export type DuplicateHandling = "all" | "expenses_only" | "smart_merge";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  is_default: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  merchant: string;
  description: string | null;
  category_id: string | null;
  source: TransactionSource;
  confidence: number;
  raw_text: string | null;
  needs_review: boolean;
  created_at: string;
  transaction_at: string;
  category?: Category;
}

export interface UserSettings {
  user_id: string;
  display_name: string | null;
  duplicate_handling: DuplicateHandling;
  default_currency: string;
  ai_model: string;
  categories_order: string[] | null;
  api_key: string;
}
