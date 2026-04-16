import { supabase } from "./supabase";
import type { Category, Transaction, UserSettings } from "../types";

// --- Categories ---

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createCategory(name: string, color: string, icon: string | null = null): Promise<Category> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: user.id, name, color, icon, is_default: false })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, updates: Partial<Pick<Category, "name" | "color" | "icon">>): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// --- Transactions ---

export interface TransactionFilters {
  category_id?: string;
  source?: string;
  needs_review?: boolean;
  search?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export async function fetchTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  let query = supabase
    .from("transactions")
    .select("*, category:categories(*)")
    .order("transaction_at", { ascending: false });

  if (filters.category_id) query = query.eq("category_id", filters.category_id);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.needs_review !== undefined) query = query.eq("needs_review", filters.needs_review);
  if (filters.search) query = query.ilike("merchant", `%${filters.search}%`);
  if (filters.from_date) query = query.gte("transaction_at", filters.from_date);
  if (filters.to_date) query = query.lte("transaction_at", filters.to_date);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateTransaction(
  id: string,
  updates: Partial<Pick<Transaction, "amount" | "merchant" | "description" | "category_id" | "direction" | "needs_review" | "transaction_at">>
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .select("*, category:categories(*)")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function createManualTransaction(entry: {
  amount: number;
  merchant: string;
  description?: string;
  category_id: string;
  direction: "expense" | "income";
  source: "manual" | "receipt";
  transaction_at?: string;
}): Promise<Transaction> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      amount: entry.amount,
      merchant: entry.merchant,
      description: entry.description ?? null,
      category_id: entry.category_id,
      direction: entry.direction,
      source: entry.source,
      confidence: 1.0,
      needs_review: false,
      transaction_at: entry.transaction_at ?? new Date().toISOString()
    })
    .select("*, category:categories(*)")
    .single();

  if (error) throw error;
  return data;
}

// --- User Settings ---

export async function fetchSettings(): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateSettings(updates: Partial<Pick<UserSettings, "display_name" | "duplicate_handling" | "default_currency" | "ai_model" | "categories_order">>): Promise<UserSettings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// --- Dashboard Aggregates ---

export async function fetchMonthlyTotal(year: number, month: number): Promise<number> {
  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from("transactions")
    .select("amount")
    .eq("direction", "expense")
    .gte("transaction_at", from)
    .lte("transaction_at", to);

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
}

export async function fetchNeedsReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("needs_review", true);

  if (error) throw error;
  return count ?? 0;
}
