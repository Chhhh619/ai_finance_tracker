# Automated Transaction Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the localStorage-only PWA with a Supabase-backed system that accepts automated transaction input from iOS Shortcuts (via on-device Apple OCR), processes text with Gemini Flash, and provides a multi-page PWA for viewing/editing transactions with Passkey auth.

**Architecture:** iOS Shortcuts extract text from screenshots/receipts using Apple's on-device OCR, POST the text to a Supabase Edge Function. The Edge Function calls Gemini Flash to extract transaction details, validates with Zod, applies duplicate handling rules, and stores in Postgres. The React PWA reads from Supabase, supports manual capture as fallback (with offline queue), and uses session persistence + WebAuthn/Passkeys for auth.

**Tech Stack:** React 19, TypeScript, Vite, Supabase (Postgres + Edge Functions + Auth), Gemini Flash (Google AI), Zod, vite-plugin-pwa

---

## File Structure

```
src/
├── main.tsx                         (modify — add Supabase provider)
├── App.tsx                          (rewrite — new routing, auth gate, remove localStorage state)
├── types.ts                         (modify — add new types for Supabase models)
├── styles.css                       (modify — add new page styles)
├── lib/
│   ├── supabase.ts                  (create — Supabase client init)
│   ├── auth.ts                      (create — auth helpers: session, passkey, magic link)
│   ├── api.ts                       (create — Supabase data queries for transactions/categories/settings)
│   ├── offline-queue.ts             (create — localStorage queue for offline manual captures)
│   ├── categories.ts                (modify — keep defaults, remove keyword scoring)
│   ├── storage.ts                   (keep — still used for offline cache)
│   ├── parser.ts                    (delete — parsing moves to Edge Function)
│   └── ai.ts                        (delete — AI calls move to Edge Function)
├── pages/
│   ├── LoginPage.tsx                (create — magic link + passkey login)
│   ├── DashboardPage.tsx            (create — extracted from App.tsx, reads from Supabase)
│   ├── TransactionsPage.tsx         (create — full timeline with filters, edit, review)
│   ├── CapturePage.tsx              (create — manual text/photo, offline queue)
│   ├── CategoriesPage.tsx           (create — manage categories via Supabase)
│   └── SettingsPage.tsx             (create — duplicate handling, AI model, Shortcut guide, export)
├── components/
│   ├── AuthGate.tsx                 (create — session check wrapper)
│   ├── BottomNav.tsx                (create — extracted navigation)
│   └── ReviewBadge.tsx              (create — needs-review indicator)
supabase/
├── migrations/
│   └── 001_initial_schema.sql       (create — tables, RLS, seed categories)
├── functions/
│   └── ingest/
│       └── index.ts                 (create — Edge Function: auth, Gemini Flash, validate, store)
├── config.toml                      (create — Supabase project config)
.env.example                         (modify — add Supabase + Gemini env vars)
```

---

## Task 1: Supabase Project Setup & Database Schema

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/001_initial_schema.sql`
- Modify: `.env.example`

- [ ] **Step 1: Install Supabase CLI and initialize project**

```bash
npm install -g supabase
cd C:/Users/drax1/Downloads/AI_budget_webapp
supabase init
```

Expected: Creates `supabase/` directory with `config.toml`.

- [ ] **Step 2: Write the database migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Categories table
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#9298a6',
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Users can read own categories"
  on public.categories for select
  using (auth.uid() = user_id);

create policy "Users can insert own categories"
  on public.categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own categories"
  on public.categories for update
  using (auth.uid() = user_id);

create policy "Users can delete own categories"
  on public.categories for delete
  using (auth.uid() = user_id);

-- Transactions table
create type public.transaction_direction as enum ('expense', 'income');
create type public.transaction_source as enum ('ewallet', 'bank', 'manual', 'receipt');

create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount decimal(12,2) not null check (amount > 0),
  currency text not null default 'MYR',
  direction public.transaction_direction not null default 'expense',
  merchant text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  source public.transaction_source not null default 'manual',
  confidence float not null default 1.0 check (confidence >= 0 and confidence <= 1),
  raw_text text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  transaction_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "Users can read own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

create index idx_transactions_user_date on public.transactions(user_id, transaction_at desc);
create index idx_transactions_needs_review on public.transactions(user_id, needs_review) where needs_review = true;

-- User settings table
create type public.duplicate_handling as enum ('all', 'expenses_only', 'smart_merge');

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  duplicate_handling public.duplicate_handling not null default 'expenses_only',
  default_currency text not null default 'MYR',
  ai_model text not null default 'gemini-2.0-flash',
  categories_order jsonb,
  api_key text unique default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- Auto-create settings and default categories when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Create default settings
  insert into public.user_settings (user_id) values (new.id);

  -- Seed default categories
  insert into public.categories (user_id, name, color, is_default) values
    (new.id, 'Food', '#ff8d61', true),
    (new.id, 'Drinks', '#3cbde6', true),
    (new.id, 'Groceries', '#59b860', true),
    (new.id, 'Transport', '#5075ff', true),
    (new.id, 'Bills', '#f2b34a', true),
    (new.id, 'Shopping', '#d873d8', true),
    (new.id, 'Health', '#00a8a0', true),
    (new.id, 'Transfer', '#1882d9', true),
    (new.id, 'Others', '#9298a6', true);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Update .env.example**

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Gemini (for Edge Function - set via supabase secrets)
# GEMINI_API_KEY=your-gemini-api-key
```

- [ ] **Step 4: Commit**

```bash
git add supabase/ .env.example
git commit -m "feat: add Supabase schema with transactions, categories, settings, and RLS"
```

---

## Task 2: Supabase Client & Auth Helpers

**Files:**
- Modify: `package.json` (add @supabase/supabase-js)
- Create: `src/lib/supabase.ts`
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Install Supabase JS client**

```bash
cd C:/Users/drax1/Downloads/AI_budget_webapp
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create Supabase client**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 3: Create auth helpers**

Create `src/lib/auth.ts`:

```typescript
import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ email });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function registerPasskey(): Promise<{ error: string | null }> {
  // WebAuthn credential creation
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "PocketRinggit", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email ?? "user",
          displayName: user.email ?? "PocketRinggit User"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256
          { alg: -257, type: "public-key" }   // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required"
        },
        timeout: 60000
      }
    });

    if (!credential) return { error: "Passkey creation cancelled" };

    // Store the credential ID in user_settings for future verification
    const credentialId = btoa(String.fromCharCode(...new Uint8Array((credential as PublicKeyCredential).rawId)));
    await supabase
      .from("user_settings")
      .update({ passkey_credential_id: credentialId })
      .eq("user_id", user.id);

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Passkey creation failed" };
  }
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => subscription.unsubscribe();
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/supabase.ts src/lib/auth.ts
git commit -m "feat: add Supabase client and auth helpers with magic link and passkey support"
```

---

## Task 3: Supabase Data API Layer

**Files:**
- Create: `src/lib/api.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Update types for Supabase models**

Replace `src/types.ts` with:

```typescript
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
  // Joined field (not in DB)
  category?: Category;
}

export interface UserSettings {
  user_id: string;
  duplicate_handling: DuplicateHandling;
  default_currency: string;
  ai_model: string;
  categories_order: string[] | null;
  api_key: string;
}
```

- [ ] **Step 2: Create the data API layer**

Create `src/lib/api.ts`:

```typescript
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

export async function createCategory(name: string, color: string): Promise<Category> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: user.id, name, color, is_default: false })
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
  updates: Partial<Pick<Transaction, "amount" | "merchant" | "description" | "category_id" | "direction" | "needs_review">>
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

export async function updateSettings(updates: Partial<Pick<UserSettings, "duplicate_handling" | "default_currency" | "ai_model" | "categories_order">>): Promise<UserSettings> {
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
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/lib/api.ts
git commit -m "feat: add Supabase data API layer for transactions, categories, and settings"
```

---

## Task 4: Ingest Edge Function

**Files:**
- Create: `supabase/functions/ingest/index.ts`

- [ ] **Step 1: Create the Edge Function**

Create `supabase/functions/ingest/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  text: z.string().min(1).max(10000),
  source: z.enum(["auto", "receipt"]),
  timestamp: z.string().optional(),
});

const transactionSchema = z.object({
  amount: z.number().positive(),
  merchant: z.string().min(1),
  direction: z.enum(["expense", "income"]),
  category: z.string().min(1),
  source: z.enum(["ewallet", "bank"]),
  confidence: z.number().min(0).max(1),
  transaction_at: z.string().optional(),
});

const llmResponseSchema = z.array(transactionSchema);

async function callGeminiFlash(text: string, categoryNames: string[], apiKey: string): Promise<z.infer<typeof llmResponseSchema> | null> {
  const systemPrompt = [
    "You are a Malaysian financial transaction extractor.",
    "From the following text captured from an iPhone screen, extract ONLY financial transactions.",
    "Ignore all non-financial content (app names, status bar, widgets, time, battery, unrelated notifications).",
    "",
    `Assign ONE category from this list: ${categoryNames.join(", ")}.`,
    "If none fit well, use 'Others' and set confidence lower.",
    "",
    "For each transaction return a JSON object with:",
    '- amount: number (positive, in MYR)',
    '- merchant: string (merchant or recipient name)',
    '- direction: "expense" or "income"',
    '- category: string (from the list above)',
    '- source: "ewallet" or "bank" (infer from context)',
    '- confidence: number 0-1',
    '- transaction_at: ISO datetime string if you can infer it, otherwise omit',
    "",
    "Return a JSON array only. No markdown, no explanation.",
    "If no financial transaction is found, return an empty array: []",
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    const validated = llmResponseSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ status: "error", message: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authenticate via API key
  const authHeader = req.headers.get("authorization");
  const apiKey = authHeader?.replace("Bearer ", "");
  if (!apiKey) {
    return new Response(JSON.stringify({ status: "error", message: "Missing API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  if (!geminiApiKey) {
    return new Response(JSON.stringify({ status: "error", message: "Gemini API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Look up user by API key
  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (settingsError || !settings) {
    return new Response(JSON.stringify({ status: "error", message: "Invalid API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = settings.user_id;

  // Parse request body
  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await req.json();
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({ status: "error", message: "Invalid request body", details: parsed.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    body = parsed.data;
  } catch {
    return new Response(JSON.stringify({ status: "error", message: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch user's categories
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", userId);

  const categoryNames = (categories ?? []).map((c: { name: string }) => c.name);
  const categoryMap = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));

  // Call Gemini Flash
  const transactions = await callGeminiFlash(body.text, categoryNames, geminiApiKey);

  if (!transactions || transactions.length === 0) {
    return new Response(JSON.stringify({ status: "empty", message: "No transaction detected" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Apply duplicate handling
  let filtered = transactions;
  if (settings.duplicate_handling === "expenses_only") {
    // If we have both expense and income for same amount (transfer), keep only expense
    const amounts = new Map<number, typeof transactions>();
    for (const t of transactions) {
      const existing = amounts.get(t.amount) ?? [];
      existing.push(t);
      amounts.set(t.amount, existing);
    }

    filtered = [];
    for (const [, group] of amounts) {
      const hasExpense = group.some(t => t.direction === "expense");
      const hasIncome = group.some(t => t.direction === "income");
      if (hasExpense && hasIncome) {
        // Transfer detected — keep only expenses
        filtered.push(...group.filter(t => t.direction === "expense"));
      } else {
        filtered.push(...group);
      }
    }
  } else if (settings.duplicate_handling === "smart_merge") {
    // Same amount, opposite direction within the batch → merge into one expense
    const seen = new Set<number>();
    filtered = [];
    for (const t of transactions) {
      if (t.direction === "income" && seen.has(t.amount)) continue;
      if (t.direction === "expense") seen.add(t.amount);
      filtered.push(t);
    }
  }

  // Insert into database
  const inserts = filtered.map((t) => ({
    user_id: userId,
    amount: t.amount,
    currency: "MYR",
    direction: t.direction,
    merchant: t.merchant,
    description: `${t.direction === "expense" ? "Paid" : "Received"} ${t.amount} - ${t.merchant}`,
    category_id: categoryMap.get(t.category.toLowerCase()) ?? categoryMap.get("others") ?? null,
    source: body.source === "receipt" ? "receipt" as const : t.source,
    confidence: t.confidence,
    raw_text: body.text,
    needs_review: t.confidence < 0.7,
    transaction_at: t.transaction_at ?? body.timestamp ?? new Date().toISOString(),
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert(inserts)
    .select();

  if (insertError) {
    return new Response(JSON.stringify({ status: "error", message: "Failed to save transactions" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build human-readable message for Shortcut notification
  const messages = (inserted ?? []).map((t: { amount: number; merchant: string; direction: string }) =>
    `${t.direction === "expense" ? "Recorded" : "Received"} RM ${Number(t.amount).toFixed(2)} ${t.direction === "expense" ? "→" : "←"} ${t.merchant}`
  );

  return new Response(JSON.stringify({
    status: "ok",
    entries: inserted,
    message: messages.join("; ") || "Transaction recorded",
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/ingest/index.ts
git commit -m "feat: add ingest Edge Function with Gemini Flash parsing and duplicate handling"
```

---

## Task 5: Offline Queue for Manual Captures

**Files:**
- Create: `src/lib/offline-queue.ts`

- [ ] **Step 1: Create offline queue module**

Create `src/lib/offline-queue.ts`:

```typescript
import { loadFromStorage, saveToStorage } from "./storage";
import { supabase } from "./supabase";

const QUEUE_KEY = "pocketringgit.offline-queue.v1";

interface QueuedEntry {
  id: string;
  text: string;
  source: "manual" | "receipt";
  timestamp: string;
  queuedAt: string;
}

export function getQueue(): QueuedEntry[] {
  return loadFromStorage<QueuedEntry[]>(QUEUE_KEY, []);
}

export function addToQueue(text: string, source: "manual" | "receipt"): void {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    text,
    source,
    timestamp: new Date().toISOString(),
    queuedAt: new Date().toISOString(),
  });
  saveToStorage(QUEUE_KEY, queue);
}

function removeFromQueue(id: string): void {
  const queue = getQueue().filter((item) => item.id !== id);
  saveToStorage(QUEUE_KEY, queue);
}

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  const { data: settings } = await supabase.from("user_settings").select("api_key").single();
  if (!settings?.api_key) return { synced: 0, failed: queue.length };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  for (const item of queue) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.api_key}`,
        },
        body: JSON.stringify({
          text: item.text,
          source: item.source === "manual" ? "auto" : "receipt",
          timestamp: item.timestamp,
        }),
      });

      if (response.ok) {
        removeFromQueue(item.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

export function setupOnlineSync(): void {
  window.addEventListener("online", () => {
    void flushQueue();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/offline-queue.ts
git commit -m "feat: add offline queue with auto-sync on reconnect"
```

---

## Task 6: Auth Gate & Login Page

**Files:**
- Create: `src/components/AuthGate.tsx`
- Create: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Create AuthGate component**

Create `src/components/AuthGate.tsx`:

```tsx
import { useEffect, useState } from "react";
import { onAuthStateChange, getSession } from "../lib/auth";
import type { Session } from "@supabase/supabase-js";
import LoginPage from "../pages/LoginPage";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    getSession().then(setSession);
    const unsubscribe = onAuthStateChange(setSession);
    return unsubscribe;
  }, []);

  // Loading state
  if (session === undefined) {
    return (
      <div className="auth-loading">
        <p className="app-brand">PocketRinggit AI</p>
        <p>Loading...</p>
      </div>
    );
  }

  // Not authenticated
  if (session === null) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create LoginPage**

Create `src/pages/LoginPage.tsx`:

```tsx
import { useState } from "react";
import { signInWithMagicLink } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSending(true);
    setStatus("Sending magic link...");

    const { error } = await signInWithMagicLink(email.trim());
    if (error) {
      setStatus(`Error: ${error}`);
    } else {
      setStatus("Check your email for the magic link!");
    }
    setIsSending(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="app-brand">PocketRinggit AI</p>
        <h1>Sign In</h1>
        <p className="login-subtitle">Enter your email to receive a magic link.</p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <input
            type="email"
            className="text-input login-email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <button className="button button-primary login-button" type="submit" disabled={isSending}>
            {isSending ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        {status && <p className="status-line">{status}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AuthGate.tsx src/pages/LoginPage.tsx
git commit -m "feat: add AuthGate and LoginPage with magic link authentication"
```

---

## Task 7: Bottom Navigation Component

**Files:**
- Create: `src/components/BottomNav.tsx`
- Create: `src/components/ReviewBadge.tsx`

- [ ] **Step 1: Create ReviewBadge**

Create `src/components/ReviewBadge.tsx`:

```tsx
export default function ReviewBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return <span className="review-badge">{count > 99 ? "99+" : count}</span>;
}
```

- [ ] **Step 2: Create BottomNav**

Create `src/components/BottomNav.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import ReviewBadge from "./ReviewBadge";

interface BottomNavProps {
  reviewCount: number;
}

export default function BottomNav({ reviewCount }: BottomNavProps) {
  return (
    <nav className="app-nav" aria-label="Primary">
      <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Home
      </NavLink>
      <NavLink to="/transactions" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Transactions
        <ReviewBadge count={reviewCount} />
      </NavLink>
      <NavLink to="/capture" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Capture
      </NavLink>
      <NavLink to="/categories" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Categories
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
        Settings
      </NavLink>
    </nav>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomNav.tsx src/components/ReviewBadge.tsx
git commit -m "feat: add BottomNav and ReviewBadge components"
```

---

## Task 8: Dashboard Page

**Files:**
- Create: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create DashboardPage**

Create `src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { fetchTransactions, fetchMonthlyTotal, fetchNeedsReviewCount } from "../lib/api";
import type { Category, Transaction } from "../types";

const moneyFormatter = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const dateFormatter = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" });

interface DashboardPageProps {
  categories: Category[];
}

export default function DashboardPage({ categories }: DashboardPageProps) {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const now = new Date();
    void Promise.all([
      fetchTransactions({ limit: 10 }),
      fetchMonthlyTotal(now.getFullYear(), now.getMonth()),
      fetchNeedsReviewCount(),
    ]).then(([txns, total, count]) => {
      setRecentTransactions(txns);
      setMonthTotal(total);
      setReviewCount(count);
    });
  }, []);

  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return recentTransactions
      .filter((t) => new Date(t.transaction_at).toDateString() === today && t.direction === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [recentTransactions]);

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, { category: Category; total: number }>();
    for (const t of recentTransactions) {
      if (t.direction !== "expense" || !t.category) continue;
      const existing = totals.get(t.category.id);
      if (existing) {
        existing.total += Number(t.amount);
      } else {
        totals.set(t.category.id, { category: t.category, total: Number(t.amount) });
      }
    }
    return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [recentTransactions]);

  const maxCategoryTotal = spendByCategory[0]?.total ?? 1;

  return (
    <>
      <header className="hero-card">
        <p className="hero-kicker">PocketRinggit AI</p>
        <h1>Budget Autopilot</h1>
        <p className="hero-subtitle">Malaysia-focused finance tracking with AI extraction.</p>

        <div className="hero-metrics">
          <div className="metric-card">
            <span>This month</span>
            <strong>{moneyFormatter.format(monthTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Today</span>
            <strong>{moneyFormatter.format(todayTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Needs review</span>
            <strong>{reviewCount}</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <h2>Top Categories</h2>
          <span className="tag">This month</span>
        </div>
        {spendByCategory.length === 0 ? (
          <p className="empty-state">No transactions yet. Use an iOS Shortcut or manual Capture.</p>
        ) : (
          <div className="bar-list">
            {spendByCategory.map(({ category, total }) => (
              <div key={category.id} className="bar-row">
                <div className="bar-label-row">
                  <span>{category.name}</span>
                  <strong>{moneyFormatter.format(total)}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max((total / maxCategoryTotal) * 100, 8)}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Latest Entries</h2>
          <span className="tag">{recentTransactions.length} recent</span>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="empty-state">Your transaction timeline will appear here.</p>
        ) : (
          <ul className="entry-list">
            {recentTransactions.slice(0, 6).map((t) => (
              <li key={t.id} className="entry-item">
                <div className="entry-main">
                  <p className="entry-merchant">
                    {t.merchant}
                    {t.needs_review && <span className="review-dot" title="Needs review" />}
                  </p>
                  <p className="entry-description">{t.description}</p>
                  <p className="entry-meta">
                    {dateFormatter.format(new Date(t.transaction_at))} | {t.source}
                  </p>
                </div>
                <div className="entry-side">
                  <span className="entry-category" style={{ backgroundColor: t.category?.color ?? "#9fa6b4" }}>
                    {t.category?.name ?? "Uncategorized"}
                  </span>
                  <strong className="entry-amount">
                    {t.direction === "expense" ? "-" : "+"}{moneyFormatter.format(Number(t.amount))}
                  </strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add DashboardPage with Supabase data fetching"
```

---

## Task 9: Transactions Page

**Files:**
- Create: `src/pages/TransactionsPage.tsx`

- [ ] **Step 1: Create TransactionsPage**

Create `src/pages/TransactionsPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { fetchTransactions, updateTransaction, deleteTransaction, type TransactionFilters } from "../lib/api";
import type { Category, Transaction } from "../types";

const moneyFormatter = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const dateFormatter = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" });

interface TransactionsPageProps {
  categories: Category[];
}

export default function TransactionsPage({ categories }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 30;

  const loadTransactions = useCallback(async (reset = false) => {
    setLoading(true);
    const newOffset = reset ? 0 : offset;
    const filters: TransactionFilters = {
      limit: PAGE_SIZE,
      offset: newOffset,
    };

    if (search) filters.search = search;
    if (filterSource) filters.source = filterSource;
    if (filterCategory) filters.category_id = filterCategory;
    if (showReviewOnly) filters.needs_review = true;

    const data = await fetchTransactions(filters);

    if (reset) {
      setTransactions(data);
      setOffset(PAGE_SIZE);
    } else {
      setTransactions((prev) => [...prev, ...data]);
      setOffset(newOffset + PAGE_SIZE);
    }
    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, [search, filterSource, filterCategory, showReviewOnly, offset]);

  useEffect(() => {
    void loadTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterSource, filterCategory, showReviewOnly]);

  const handleUpdate = async (id: string, updates: Parameters<typeof updateTransaction>[1]) => {
    const updated = await updateTransaction(id, updates);
    setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Transactions</h2>
        <span className="tag">{transactions.length} shown</span>
      </div>

      <div className="filters-row">
        <input
          type="search"
          className="filter-input"
          placeholder="Search merchant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="ewallet">E-wallet</option>
          <option value="bank">Bank</option>
          <option value="manual">Manual</option>
          <option value="receipt">Receipt</option>
        </select>
        <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="filter-toggle">
          <input type="checkbox" checked={showReviewOnly} onChange={(e) => setShowReviewOnly(e.target.checked)} />
          Needs review
        </label>
      </div>

      {transactions.length === 0 && !loading ? (
        <p className="empty-state">No transactions match your filters.</p>
      ) : (
        <ul className="entry-list">
          {transactions.map((t) => (
            <li key={t.id} className={`entry-item${t.needs_review ? " needs-review" : ""}`}>
              {editingId === t.id ? (
                <div className="entry-edit">
                  <select
                    className="filter-select"
                    defaultValue={t.category_id ?? ""}
                    onChange={(e) => void handleUpdate(t.id, { category_id: e.target.value, needs_review: false })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="button button-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="button button-danger" onClick={() => void handleDelete(t.id)}>Delete</button>
                </div>
              ) : (
                <>
                  <div className="entry-main" onClick={() => setEditingId(t.id)}>
                    <p className="entry-merchant">
                      {t.merchant}
                      {t.needs_review && <span className="review-dot" title="Needs review" />}
                    </p>
                    <p className="entry-description">{t.description}</p>
                    <p className="entry-meta">
                      {dateFormatter.format(new Date(t.transaction_at))} | {t.source} | {Math.round(t.confidence * 100)}%
                    </p>
                  </div>
                  <div className="entry-side">
                    <span className="entry-category" style={{ backgroundColor: t.category?.color ?? "#9fa6b4" }}>
                      {t.category?.name ?? "Uncategorized"}
                    </span>
                    <strong className="entry-amount">
                      {t.direction === "expense" ? "-" : "+"}{moneyFormatter.format(Number(t.amount))}
                    </strong>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button className="button button-secondary load-more" onClick={() => void loadTransactions(false)} disabled={loading}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/TransactionsPage.tsx
git commit -m "feat: add TransactionsPage with filters, edit, delete, and pagination"
```

---

## Task 10: Capture Page (Manual Fallback)

**Files:**
- Create: `src/pages/CapturePage.tsx`

- [ ] **Step 1: Create CapturePage**

Create `src/pages/CapturePage.tsx`:

```tsx
import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { addToQueue, getQueue } from "../lib/offline-queue";
import { createManualTransaction } from "../lib/api";
import type { Category } from "../types";

interface CapturePageProps {
  categories: Category[];
  onTransactionAdded: () => void;
}

export default function CapturePage({ categories, onTransactionAdded }: CapturePageProps) {
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Ready. Paste text or take a photo.");
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual entry state
  const [manualAmount, setManualAmount] = useState("");
  const [manualMerchant, setManualMerchant] = useState("");
  const [manualCategory, setManualCategory] = useState(categories[0]?.id ?? "");
  const [manualDirection, setManualDirection] = useState<"expense" | "income">("expense");

  const sendToIngest = async (text: string, source: "auto" | "receipt") => {
    const { data: settings } = await supabase.from("user_settings").select("api_key").single();
    if (!settings?.api_key) {
      setStatus("API key not found. Check Settings.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({ text, source, timestamp: new Date().toISOString() }),
    });

    const result = await response.json();
    return result;
  };

  const handleAnalyzeText = async () => {
    const text = inputText.trim();
    if (!text) {
      setStatus("Input is empty.");
      return;
    }

    setIsProcessing(true);
    setStatus("Analyzing...");

    if (!navigator.onLine) {
      addToQueue(text, "manual");
      const queueSize = getQueue().length;
      setStatus(`Offline. Queued for sync (${queueSize} pending).`);
      setIsProcessing(false);
      setInputText("");
      return;
    }

    try {
      const result = await sendToIngest(text, "auto");
      if (result.status === "ok") {
        setStatus(result.message);
        setInputText("");
        onTransactionAdded();
      } else if (result.status === "empty") {
        setStatus("No transaction detected in this text.");
      } else {
        setStatus(`Error: ${result.message}`);
      }
    } catch {
      addToQueue(text, "manual");
      setStatus("Request failed. Queued for later sync.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoCapture = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setStatus("Extracting text from photo...");

    // We still use the browser to read the image, but we send the raw text
    // For PWA fallback, we import tesseract only when needed
    try {
      const { recognize } = await import("tesseract.js");
      const file = files[0];
      const result = await recognize(file, "eng");
      const text = result.data.text?.trim();

      if (!text) {
        setStatus("Could not extract text from image.");
        setIsProcessing(false);
        return;
      }

      if (!navigator.onLine) {
        addToQueue(text, "receipt");
        setStatus(`Offline. Queued for sync.`);
        setIsProcessing(false);
        return;
      }

      const ingestResult = await sendToIngest(text, "receipt");
      if (ingestResult.status === "ok") {
        setStatus(ingestResult.message);
        onTransactionAdded();
      } else {
        setStatus(ingestResult.message ?? "No transaction detected.");
      }
    } catch {
      setStatus("OCR failed. Try a clearer image.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(manualAmount);
    if (!amount || !manualMerchant.trim()) {
      setStatus("Enter amount and merchant.");
      return;
    }

    setIsProcessing(true);
    try {
      await createManualTransaction({
        amount,
        merchant: manualMerchant.trim(),
        category_id: manualCategory,
        direction: manualDirection,
        source: "manual",
      });
      setStatus(`Recorded RM ${amount.toFixed(2)} → ${manualMerchant.trim()}`);
      setManualAmount("");
      setManualMerchant("");
      onTransactionAdded();
    } catch {
      setStatus("Failed to save. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Capture</h2>
        <div className="mode-toggle">
          <button className={`mode-btn${mode === "ai" ? " active" : ""}`} onClick={() => setMode("ai")}>
            AI Parse
          </button>
          <button className={`mode-btn${mode === "manual" ? " active" : ""}`} onClick={() => setMode("manual")}>
            Manual
          </button>
        </div>
      </div>

      {mode === "ai" ? (
        <>
          <textarea
            className="text-input"
            rows={6}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste notification text or receipt content here."
          />
          <div className="button-row">
            <button className="button button-primary" onClick={() => void handleAnalyzeText()} disabled={isProcessing}>
              {isProcessing ? "Analyzing..." : "Analyze Text"}
            </button>
            <button
              className="button button-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              Scan Photo
            </button>
          </div>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void handlePhotoCapture(e.currentTarget.files)}
          />
        </>
      ) : (
        <form className="manual-form" onSubmit={(e) => void handleManualSubmit(e)}>
          <input
            type="number"
            step="0.01"
            className="text-input"
            placeholder="Amount (RM)"
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            required
          />
          <input
            type="text"
            className="text-input"
            placeholder="Merchant name"
            value={manualMerchant}
            onChange={(e) => setManualMerchant(e.target.value)}
            required
          />
          <select className="filter-select" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="filter-select" value={manualDirection} onChange={(e) => setManualDirection(e.target.value as "expense" | "income")}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <button className="button button-primary" type="submit" disabled={isProcessing}>
            {isProcessing ? "Saving..." : "Record Transaction"}
          </button>
        </form>
      )}

      <p className="status-line">{status}</p>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/CapturePage.tsx
git commit -m "feat: add CapturePage with AI parsing, photo OCR, manual entry, and offline queue"
```

---

## Task 11: Categories Page

**Files:**
- Create: `src/pages/CategoriesPage.tsx`

- [ ] **Step 1: Create CategoriesPage**

Create `src/pages/CategoriesPage.tsx`:

```tsx
import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "../lib/api";
import { pickCategoryColor } from "../lib/categories";
import type { Category } from "../types";

interface CategoriesPageProps {
  categories: Category[];
  onCategoriesChanged: () => void;
}

export default function CategoriesPage({ categories, onCategoriesChanged }: CategoriesPageProps) {
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setStatus(`"${name}" already exists.`);
      return;
    }

    try {
      await createCategory(name, pickCategoryColor(name));
      setNewName("");
      setStatus(`Added: ${name}`);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to add category.");
    }
  };

  const handleDelete = async (id: string, name: string, isDefault: boolean) => {
    if (isDefault) {
      setStatus("Cannot delete default categories.");
      return;
    }

    try {
      await deleteCategory(id);
      setStatus(`Deleted: ${name}`);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to delete category.");
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;

    try {
      await updateCategory(id, { name });
      setEditingId(null);
      setStatus(`Renamed to: ${name}`);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to rename.");
    }
  };

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Categories</h2>
        <span className="tag">{categories.length} total</span>
      </div>

      <div className="category-grid">
        {categories.map((c) => (
          <div key={c.id} className="category-chip-wrap">
            {editingId === c.id ? (
              <form
                className="category-edit-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleRename(c.id);
                }}
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setEditingId(null)}>X</button>
              </form>
            ) : (
              <span
                className="category-chip"
                style={{ backgroundColor: c.color }}
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                }}
              >
                {c.name}
                {!c.is_default && (
                  <button
                    className="chip-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(c.id, c.name, c.is_default);
                    }}
                  >
                    x
                  </button>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      <form className="category-form" onSubmit={(e) => void handleAdd(e)}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add custom category"
        />
        <button className="button button-secondary" type="submit">Add</button>
      </form>

      {status && <p className="status-line">{status}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/CategoriesPage.tsx
git commit -m "feat: add CategoriesPage with add, rename, and delete via Supabase"
```

---

## Task 12: Settings Page

**Files:**
- Create: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create SettingsPage**

Create `src/pages/SettingsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchSettings, updateSettings, fetchTransactions } from "../lib/api";
import { signOut, registerPasskey } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { getQueue, flushQueue } from "../lib/offline-queue";
import type { DuplicateHandling, UserSettings } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [status, setStatus] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    void fetchSettings().then(setSettings);
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
    setQueueCount(getQueue().length);
  }, []);

  const handleDuplicateChange = async (value: DuplicateHandling) => {
    try {
      const updated = await updateSettings({ duplicate_handling: value });
      setSettings(updated);
      setStatus("Duplicate handling updated.");
    } catch {
      setStatus("Failed to update setting.");
    }
  };

  const handleRegisterPasskey = async () => {
    setStatus("Setting up Face ID...");
    const { error } = await registerPasskey();
    setStatus(error ?? "Face ID enabled!");
  };

  const handleExportCSV = async () => {
    setStatus("Exporting...");
    try {
      const transactions = await fetchTransactions({ limit: 10000 });
      const headers = "Date,Merchant,Amount,Direction,Category,Source,Confidence\n";
      const rows = transactions.map((t) =>
        `"${t.transaction_at}","${t.merchant}",${t.amount},"${t.direction}","${t.category?.name ?? ""}","${t.source}",${t.confidence}`
      ).join("\n");

      const blob = new Blob([headers + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pocketringgit-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Exported successfully.");
    } catch {
      setStatus("Export failed.");
    }
  };

  const handleFlushQueue = async () => {
    setStatus("Syncing offline entries...");
    const { synced, failed } = await flushQueue();
    setQueueCount(getQueue().length);
    setStatus(`Synced ${synced}, failed ${failed}.`);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (!settings) return <p className="status-line">Loading settings...</p>;

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Settings</h2>
        <span className="tag">Config</span>
      </div>

      <div className="settings-section">
        <h3>Account</h3>
        <p className="settings-detail">{userEmail}</p>
        <div className="button-row">
          <button className="button button-secondary" onClick={() => void handleRegisterPasskey()}>
            Enable Face ID
          </button>
          <button className="button button-danger" onClick={() => void handleSignOut()}>
            Sign Out
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Duplicate Handling</h3>
        <p className="settings-detail">How to handle transfer notifications that appear from both sender and receiver.</p>
        <select
          className="filter-select"
          value={settings.duplicate_handling}
          onChange={(e) => void handleDuplicateChange(e.target.value as DuplicateHandling)}
        >
          <option value="expenses_only">Expenses only (default)</option>
          <option value="all">Record all (both sides)</option>
          <option value="smart_merge">Smart merge (deduplicate)</option>
        </select>
      </div>

      <div className="settings-section">
        <h3>API Key (for iOS Shortcuts)</h3>
        <p className="settings-detail">Use this key in your Shortcut's Authorization header.</p>
        <code className="api-key-display">{settings.api_key}</code>
      </div>

      <div className="settings-section">
        <h3>iOS Shortcut Setup</h3>
        <ol className="steps-list">
          <li>Open the Shortcuts app on your iPhone.</li>
          <li>Create a new shortcut named "PocketRinggit Capture".</li>
          <li>Add action: <strong>Take Screenshot</strong>.</li>
          <li>Add action: <strong>Extract Text from Image</strong> (uses the screenshot).</li>
          <li>Add action: <strong>Get Contents of URL</strong>:
            <ul>
              <li>URL: <code>{import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest</code></li>
              <li>Method: POST</li>
              <li>Headers: Authorization = Bearer {settings.api_key ? settings.api_key.slice(0, 8) + "..." : "<your key>"}</li>
              <li>Body (JSON): {`{ "text": [Extracted Text], "source": "auto", "timestamp": [Current Date ISO] }`}</li>
            </ul>
          </li>
          <li>Add action: <strong>Show Notification</strong> with the response message.</li>
          <li>Assign to Back Tap, Action Button, or Control Center.</li>
        </ol>
        <p className="settings-detail">
          For receipts, create a second shortcut that opens the Camera instead of taking a screenshot, with source set to "receipt".
        </p>
      </div>

      {queueCount > 0 && (
        <div className="settings-section">
          <h3>Offline Queue</h3>
          <p className="settings-detail">{queueCount} entries pending sync.</p>
          <button className="button button-primary" onClick={() => void handleFlushQueue()}>
            Sync Now
          </button>
        </div>
      )}

      <div className="settings-section">
        <h3>Data</h3>
        <button className="button button-secondary" onClick={() => void handleExportCSV()}>
          Export as CSV
        </button>
      </div>

      {status && <p className="status-line">{status}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: add SettingsPage with duplicate handling, API key display, Shortcut guide, export"
```

---

## Task 13: Rewrite App.tsx (Router + Auth + Supabase Data)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Delete: `src/lib/parser.ts`
- Delete: `src/lib/ai.ts`

- [ ] **Step 1: Delete old parser and AI modules**

```bash
cd C:/Users/drax1/Downloads/AI_budget_webapp
rm src/lib/parser.ts src/lib/ai.ts
```

- [ ] **Step 2: Rewrite App.tsx**

Replace `src/App.tsx` with:

```tsx
import { useCallback, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AuthGate from "./components/AuthGate";
import BottomNav from "./components/BottomNav";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import CapturePage from "./pages/CapturePage";
import CategoriesPage from "./pages/CategoriesPage";
import SettingsPage from "./pages/SettingsPage";
import { fetchCategories, fetchNeedsReviewCount } from "./lib/api";
import { setupOnlineSync } from "./lib/offline-queue";
import type { Category } from "./types";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/capture": "Capture",
  "/categories": "Categories",
  "/settings": "Settings",
};

function AppShell() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const location = useLocation();

  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories();
      setCategories(cats);
    } catch {
      // Will retry on next navigation
    }
  }, []);

  const loadReviewCount = useCallback(async () => {
    try {
      const count = await fetchNeedsReviewCount();
      setReviewCount(count);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadReviewCount();
    setupOnlineSync();
  }, [loadCategories, loadReviewCount]);

  // Refresh review count on navigation
  useEffect(() => {
    void loadReviewCount();
  }, [location.pathname, refreshKey, loadReviewCount]);

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void loadReviewCount();
  }, [loadReviewCount]);

  const pageTitle = pageTitles[location.pathname] ?? "Dashboard";

  return (
    <div className="app-frame">
      <header className="app-header">
        <p className="app-brand">PocketRinggit AI</p>
        <h1>{pageTitle}</h1>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<DashboardPage categories={categories} />} />
          <Route path="/transactions" element={<TransactionsPage categories={categories} />} />
          <Route
            path="/capture"
            element={<CapturePage categories={categories} onTransactionAdded={handleDataChanged} />}
          />
          <Route
            path="/categories"
            element={<CategoriesPage categories={categories} onCategoriesChanged={loadCategories} />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <BottomNav reviewCount={reviewCount} />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </HashRouter>
  );
}
```

- [ ] **Step 3: Update main.tsx**

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: rewrite App.tsx with Supabase auth, routing, and data flow — remove old parser/AI"
```

---

## Task 14: Update Styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add new styles**

Append to `src/styles.css`:

```css
/* Login page */
.login-page {
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 20px;
}

.login-card {
  width: min(400px, 100%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 24px;
  padding: 28px 20px;
  box-shadow: 0 14px 28px rgba(17, 45, 77, 0.08);
}

.login-card h1 {
  margin: 8px 0 4px;
  font-family: "Sora", "Outfit", sans-serif;
}

.login-subtitle {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 0.9rem;
}

.login-email {
  margin-bottom: 10px;
  min-height: auto;
  resize: none;
}

.login-button {
  width: 100%;
}

/* Auth loading */
.auth-loading {
  min-height: 100svh;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--muted);
}

/* Filters */
.filters-row {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-input {
  width: 100%;
  border: 1px solid #d0dae8;
  border-radius: 12px;
  padding: 10px 11px;
  font: inherit;
}

.filter-select {
  width: 100%;
  border: 1px solid #d0dae8;
  border-radius: 12px;
  padding: 10px 11px;
  font: inherit;
  background: #fff;
}

.filter-toggle {
  font-size: 0.88rem;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}

/* Review indicators */
.review-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  margin-left: 6px;
  vertical-align: middle;
}

.review-badge {
  display: inline-block;
  background: #f59e0b;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 5px;
  margin-left: 4px;
  vertical-align: top;
}

.needs-review {
  border-color: #fcd34d;
  background: rgba(253, 224, 71, 0.08);
}

/* Entry edit */
.entry-edit {
  display: grid;
  gap: 8px;
  grid-column: 1 / -1;
}

/* Load more */
.load-more {
  margin-top: 12px;
  width: 100%;
}

/* Mode toggle */
.mode-toggle {
  display: flex;
  gap: 4px;
  background: #edf2f9;
  border-radius: 10px;
  padding: 3px;
}

.mode-btn {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 6px 12px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}

.mode-btn.active {
  background: #fff;
  color: var(--brand);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Manual form */
.manual-form {
  display: grid;
  gap: 8px;
}

.manual-form .text-input {
  min-height: auto;
  resize: none;
}

/* Settings */
.settings-section {
  padding: 14px 0;
  border-bottom: 1px solid #e5edf8;
}

.settings-section:last-of-type {
  border-bottom: none;
}

.settings-section h3 {
  margin: 0 0 4px;
  font-family: "Sora", "Outfit", sans-serif;
  font-size: 0.95rem;
}

.settings-detail {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 0.88rem;
}

.api-key-display {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  background: #edf2f9;
  border-radius: 8px;
  padding: 10px;
  word-break: break-all;
  user-select: all;
}

/* Danger button */
.button-danger {
  color: #fff;
  background: #ef4444;
}

/* Chip delete */
.chip-delete {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  margin-left: 4px;
  cursor: pointer;
  padding: 0 2px;
}

.category-chip-wrap {
  display: inline-block;
}

.category-edit-inline {
  display: flex;
  gap: 4px;
  align-items: center;
}

.category-edit-inline input {
  border: 1px solid #d0dae8;
  border-radius: 8px;
  padding: 4px 8px;
  font: inherit;
  font-size: 0.82rem;
  width: 100px;
}

.category-edit-inline button {
  border: none;
  background: var(--brand-soft);
  color: var(--brand);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: add styles for login, filters, review badges, settings, and manual entry"
```

---

## Task 15: Update categories.ts (Remove keyword scoring)

**Files:**
- Modify: `src/lib/categories.ts`

- [ ] **Step 1: Simplify categories.ts**

Replace `src/lib/categories.ts` with:

```typescript
const customColorPalette = ["#f15b5d", "#ef8a2f", "#00a9a5", "#1882d9", "#43a047", "#d45ab4"];

export function pickCategoryColor(name: string): string {
  const asciiSum = [...name.toLowerCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return customColorPalette[asciiSum % customColorPalette.length];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/categories.ts
git commit -m "refactor: simplify categories.ts — keyword scoring moved to Edge Function LLM"
```

---

## Task 16: Update package.json (Remove tesseract.js as hard dependency)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Keep tesseract.js as optional**

Tesseract.js is still used in CapturePage for the PWA photo fallback, but it's dynamically imported (`await import("tesseract.js")`), so it's already lazy-loaded. No change needed to package.json — it stays as a dependency but won't affect bundle size for pages that don't use it.

However, we should remove the static import from any file. The old `App.tsx` had `import { recognize } from "tesseract.js"` at the top. The new `CapturePage.tsx` already uses dynamic import. Verify no static imports remain:

```bash
cd C:/Users/drax1/Downloads/AI_budget_webapp
grep -r "from \"tesseract" src/
```

Expected: Only `src/pages/CapturePage.tsx` with `await import("tesseract.js")`, no static imports.

- [ ] **Step 2: Update .env.example with final vars**

Replace `.env.example` with:

```bash
# Supabase (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Legacy (no longer used — AI runs server-side via Edge Function)
# VITE_OPENROUTER_API_KEY=
# VITE_OPENROUTER_MODEL=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: update .env.example for Supabase config, mark legacy vars"
```

---

## Task 17: Final Verification & Build Test

- [ ] **Step 1: Verify all files are in place**

```bash
cd C:/Users/drax1/Downloads/AI_budget_webapp
ls src/lib/
ls src/pages/
ls src/components/
ls supabase/migrations/
ls supabase/functions/ingest/
```

Expected files:
- `src/lib/`: supabase.ts, auth.ts, api.ts, offline-queue.ts, categories.ts, storage.ts
- `src/pages/`: LoginPage.tsx, DashboardPage.tsx, TransactionsPage.tsx, CapturePage.tsx, CategoriesPage.tsx, SettingsPage.tsx
- `src/components/`: AuthGate.tsx, BottomNav.tsx, ReviewBadge.tsx
- `supabase/migrations/`: 001_initial_schema.sql
- `supabase/functions/ingest/`: index.ts

- [ ] **Step 2: Run TypeScript compilation check**

```bash
npx tsc --noEmit
```

Fix any type errors that appear.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any build/type errors from integration"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Supabase schema + migrations | `supabase/migrations/001_initial_schema.sql` |
| 2 | Supabase client + auth helpers | `src/lib/supabase.ts`, `src/lib/auth.ts` |
| 3 | Data API layer | `src/lib/api.ts`, `src/types.ts` |
| 4 | Ingest Edge Function | `supabase/functions/ingest/index.ts` |
| 5 | Offline queue | `src/lib/offline-queue.ts` |
| 6 | Auth gate + login page | `src/components/AuthGate.tsx`, `src/pages/LoginPage.tsx` |
| 7 | Bottom nav + review badge | `src/components/BottomNav.tsx`, `src/components/ReviewBadge.tsx` |
| 8 | Dashboard page | `src/pages/DashboardPage.tsx` |
| 9 | Transactions page | `src/pages/TransactionsPage.tsx` |
| 10 | Capture page | `src/pages/CapturePage.tsx` |
| 11 | Categories page | `src/pages/CategoriesPage.tsx` |
| 12 | Settings page | `src/pages/SettingsPage.tsx` |
| 13 | Rewrite App.tsx + main.tsx | `src/App.tsx`, `src/main.tsx` |
| 14 | Update styles | `src/styles.css` |
| 15 | Simplify categories.ts | `src/lib/categories.ts` |
| 16 | Clean up env vars | `.env.example` |
| 17 | Final build verification | All files |
