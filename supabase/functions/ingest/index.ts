import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  text: z.string().min(1).max(10000).optional(),
  // base64 encoded image; ~8M chars ≈ 6MB binary, plenty for a receipt photo
  image: z.string().max(8_000_000).optional(),
  source: z.enum(["auto", "receipt"]).default("auto"),
  timestamp: z.string().optional(),
});

const transactionSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  merchant: z.string().min(1),
  direction: z.enum(["expense", "income"]),
  category: z.string().min(1),
  source: z.enum(["ewallet", "bank", "manual", "receipt"]),
  confidence: z.number().min(0).max(1),
  transaction_at: z.string().optional(),
});

const llmResponseSchema = z.array(transactionSchema);

function hasExplicitTimezoneOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function normalizeTransactionAt(value: string): string {
  const trimmed = value.trim();
  if (hasExplicitTimezoneOffset(trimmed)) return trimmed;

  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return `${dateOnly[1]}T00:00:00+08:00`;
  }

  const dateTime = /^(\d{4}-\d{2}-\d{2})([T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/.exec(trimmed);
  if (dateTime) {
    return `${dateTime[1]}${dateTime[2].replace(/\s/, "T")}+08:00`;
  }

  return trimmed;
}

function makeRequestId() {
  return Math.random().toString(36).slice(2, 10);
}

// Best-effort per-key rate limit (in-memory per isolate; resets on cold start).
// Caps Gemini spend if an API key leaks — 20 captures per minute is far above
// any legitimate usage.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const recentRequests = new Map<string, number[]>();

function isRateLimited(apiKey: string): boolean {
  const now = Date.now();
  const hits = (recentRequests.get(apiKey) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    recentRequests.set(apiKey, hits);
    return true;
  }
  hits.push(now);
  recentRequests.set(apiKey, hits);
  return false;
}

function log(requestId: string, stage: string, extra?: Record<string, unknown>) {
  const payload = { requestId, stage, ...(extra ?? {}) };
  console.log(JSON.stringify(payload));
}

// Fetches 1 `from` = ? `to` for a given date from Frankfurter (ECB rates).
// Returns null on any failure or unsupported currency — caller then flags the
// record for review rather than dropping it.
async function fetchExchangeRate(
  from: string,
  to: string,
  date: string,
  requestId: string,
  cache: Map<string, number | null>,
): Promise<number | null> {
  if (from === to) return 1;
  const key = `${from}:${to}:${date}`;
  if (cache.has(key)) return cache.get(key)!;

  log(requestId, "fx_fetch_start", { from, to, date });
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`,
    );
    if (!res.ok) {
      log(requestId, "fx_fetch_failed", { from, to, date, status: res.status });
      cache.set(key, null);
      return null;
    }
    const data = await res.json();
    const rate = data?.rates?.[to];
    if (typeof rate !== "number") {
      log(requestId, "fx_fetch_failed", { from, to, date, reason: "no_rate_in_response" });
      cache.set(key, null);
      return null;
    }
    log(requestId, "fx_fetch_done", { from, to, date, rate, rateDate: data.date });
    cache.set(key, rate);
    return rate;
  } catch (e) {
    log(requestId, "fx_fetch_failed", { from, to, date, error: String(e) });
    cache.set(key, null);
    return null;
  }
}

// Minimal money formatter for the response message (Deno has Intl; cannot import
// the browser money.ts). Mirrors src/lib/money.ts symbol/decimal rules.
const MSG_SYMBOL_OVERRIDE: Record<string, string> = { MYR: "RM", SGD: "S$" };
function fmtMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  let symbol = MSG_SYMBOL_OVERRIDE[code];
  if (!symbol) {
    try {
      symbol = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
        .formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
    } catch {
      symbol = code;
    }
  }
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { /* keep 2 */ }
  return `${symbol}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

async function callGeminiFlash(
  text: string | undefined,
  imageBase64: string | undefined,
  categoryNames: string[],
  apiKey: string,
  source: string,
  requestId: string
): Promise<{ transactions: z.infer<typeof llmResponseSchema> | null }> {
  const systemPrompt = [
    "You are a financial transaction extractor for a Malaysian budgeting app.",
    "Extract financial transactions from the input (bank notifications, e-wallet notifications, receipts, or any spending text).",
    "",
    "IMPORTANT RULES:",
    "- For receipts: extract ONE transaction using the FINAL TOTAL amount (after tax/service charge). Do NOT extract subtotals, individual items, or tax lines as separate transactions.",
    "- For bank/e-wallet notifications: extract each distinct transaction.",
    "- The merchant should be the store or business name, NOT individual item names.",
    "- If the input has multiple unrelated transactions (e.g. several notifications), extract each one.",
    "",
    `Assign ONE category from this list (labels include the category type): ${categoryNames.join(", ")}.`,
    "If none fit well, use 'Others' and set confidence lower.",
    "",
    "For each transaction return a JSON object with:",
    "- amount: number (positive, the FINAL total as printed, in the currency you detected)",
    "- currency: string (ISO 4217 code, e.g. 'MYR', 'SGD', 'USD', 'JPY'). Infer from the currency symbol (RM, S$, $, ¥, ฿, Rp), any explicit code, the store's country, or the language. Default to 'MYR' only if genuinely ambiguous.",
    "- merchant: string (business/store name, e.g. 'McDonald's', 'Grab', 'Touch n Go')",
    '- direction: "expense" or "income"',
    "- category: string (from the list above)",
    `- source: "${source === "receipt" ? "receipt" : "manual"}" (use this exact value)`,
    "- confidence: number 0-1",
    `- transaction_at: ISO datetime string with an explicit timezone offset if visible, otherwise omit. If the source time is in Malaysia local time, use +08:00. The current date/time is ${new Date().toISOString()} (UTC). If the source shows only a date like "14 Apr" or "14/04" without a year, assume the current year. Never invent a year — if no date is visible at all, omit this field.`,
    "",
    "Return a JSON array only. No markdown, no explanation.",
    "If no financial transaction is found, return: []",
  ].join("\n");

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (text) {
    parts.push({ text });
  }

  if (imageBase64) {
    // Detect mime type from base64 header or default to jpeg
    let mimeType = "image/jpeg";
    if (imageBase64.startsWith("data:")) {
      const match = imageBase64.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
        // Remove the data URL prefix
        imageBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
      }
    }
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }

  if (parts.length === 0) return { transactions: null };

  log(requestId, "gemini_fetch_start", {
    hasText: Boolean(text),
    textLen: text?.length ?? 0,
    hasImage: Boolean(imageBase64),
    imageBase64Len: imageBase64?.length ?? 0,
    categoryCount: categoryNames.length,
  });
  const geminiStart = Date.now();

  let response: Response;
  try {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        // Key travels in a header, not the URL — URLs end up in proxy/infra logs.
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            thinking_config: { thinking_budget: 0 },
          },
        }),
      }
    );
  } catch (e) {
    log(requestId, "gemini_fetch_threw", { error: String(e), ms: Date.now() - geminiStart });
    return { transactions: null };
  }

  const geminiMs = Date.now() - geminiStart;
  log(requestId, "gemini_fetch_done", { status: response.status, ms: geminiMs });

  if (!response.ok) {
    const errText = await response.text();
    log(requestId, "gemini_error", { status: response.status, body: errText.slice(0, 500) });
    return { transactions: null };
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    log(requestId, "gemini_no_content", { raw: JSON.stringify(data).slice(0, 500) });
    return { transactions: null };
  }

  try {
    const parsed = JSON.parse(content);
    const validated = llmResponseSchema.safeParse(parsed);
    if (!validated.success) {
      log(requestId, "gemini_validation_failed", { issues: validated.error.issues, output: content.slice(0, 500) });
      return { transactions: null };
    }
    log(requestId, "gemini_parsed", { count: validated.data.length });
    return { transactions: validated.data };
  } catch (e) {
    log(requestId, "gemini_parse_failed", { error: String(e), output: content.slice(0, 500) });
    return { transactions: null };
  }
}

Deno.serve(async (req) => {
  const requestId = makeRequestId();
  const startedAt = Date.now();

  const jsonResponse = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify({ requestId, ...payload }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
    });

  try {
    log(requestId, "request_received", {
      method: req.method,
      url: req.url,
      contentType: req.headers.get("content-type"),
      contentLength: req.headers.get("content-length"),
      userAgent: req.headers.get("user-agent"),
    });

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: { ...corsHeaders, "x-request-id": requestId } });
    }

    if (req.method !== "POST") {
      log(requestId, "method_not_allowed", { method: req.method });
      return jsonResponse(405, { status: "error", message: "Method not allowed" });
    }

    const authHeader = req.headers.get("authorization");
    const apiKey = authHeader?.replace("Bearer ", "");
    if (!apiKey) {
      log(requestId, "auth_missing");
      return jsonResponse(401, { status: "error", message: "Missing API key" });
    }

    if (isRateLimited(apiKey)) {
      log(requestId, "rate_limited");
      return jsonResponse(429, { status: "error", message: "Too many requests — try again in a minute" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      log(requestId, "gemini_key_not_configured");
      return jsonResponse(500, { status: "error", message: "Gemini API key not configured" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("api_key", apiKey)
      .single();

    if (settingsError || !settings) {
      log(requestId, "auth_invalid", { error: settingsError?.message });
      return jsonResponse(401, { status: "error", message: "Invalid API key" });
    }

    const userId = settings.user_id;
    log(requestId, "auth_ok", { userId });

    let body: z.infer<typeof requestSchema>;
    try {
      const raw = await req.json();
      const parsed = requestSchema.safeParse(raw);
      if (!parsed.success) {
        log(requestId, "body_invalid", { issues: parsed.error.issues });
        return jsonResponse(400, { status: "error", message: "Invalid request body", details: parsed.error.issues });
      }
      body = parsed.data;
    } catch (e) {
      log(requestId, "body_parse_failed", { error: String(e) });
      return jsonResponse(400, { status: "error", message: "Invalid JSON" });
    }

    if (!body.text && !body.image) {
      log(requestId, "body_empty");
      return jsonResponse(400, { status: "error", message: "Either text or image is required" });
    }

    log(requestId, "body_ok", {
      hasText: Boolean(body.text),
      textLen: body.text?.length ?? 0,
      hasImage: Boolean(body.image),
      imageLen: body.image?.length ?? 0,
      source: body.source,
    });

    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name, direction")
      .eq("user_id", userId);

    if (categoriesError) {
      log(requestId, "categories_fetch_failed", { error: categoriesError.message });
    }

    const categoryNames = (categories ?? []).map((c: { name: string; direction: string }) => `${c.name} (${c.direction})`);
    const categoryMap = new Map<string, string>();
    for (const c of (categories ?? []) as Array<{ id: string; name: string; direction: string }>) {
      categoryMap.set(`${c.name.toLowerCase()} (${c.direction.toLowerCase()})`, c.id);
      if (!categoryMap.has(c.name.toLowerCase())) {
        categoryMap.set(c.name.toLowerCase(), c.id);
      }
    }

    const geminiResult = await callGeminiFlash(body.text, body.image, categoryNames, geminiApiKey, body.source, requestId);
    const transactions = geminiResult.transactions;

    if (!transactions || transactions.length === 0) {
      log(requestId, "empty_result", { totalMs: Date.now() - startedAt });
      return jsonResponse(200, { status: "empty", message: "🔍 No transaction found in this capture" });
    }

    const accountCurrency = String(settings.default_currency ?? "MYR").toUpperCase();
    const rateCache = new Map<string, number | null>();
    const inserts: Array<Record<string, unknown>> = [];

    for (const t of transactions) {
      const normalizedAt = normalizeTransactionAt(t.transaction_at ?? body.timestamp ?? new Date().toISOString());
      const fromCurrency = (t.currency ?? accountCurrency).toUpperCase();

      let amount = t.amount;
      let currency = accountCurrency;
      let originalAmount: number | null = null;
      let originalCurrency: string | null = null;
      let exchangeRate: number | null = null;
      let needsReview = t.confidence < 0.7;

      if (fromCurrency !== accountCurrency) {
        const rateDate = normalizedAt.slice(0, 10); // YYYY-MM-DD
        const rate = await fetchExchangeRate(fromCurrency, accountCurrency, rateDate, requestId, rateCache);
        if (rate != null) {
          amount = Math.round(t.amount * rate * 100) / 100;
          originalAmount = t.amount;
          originalCurrency = fromCurrency;
          exchangeRate = rate;
        } else {
          // Conversion failed — keep the original amount/currency, flag for review.
          amount = t.amount;
          currency = fromCurrency;
          originalAmount = t.amount;
          originalCurrency = fromCurrency;
          exchangeRate = null;
          needsReview = true;
        }
      }

      inserts.push({
        user_id: userId,
        amount,
        currency,
        original_amount: originalAmount,
        original_currency: originalCurrency,
        exchange_rate: exchangeRate,
        direction: t.direction,
        merchant: t.merchant,
        description: `${t.direction === "expense" ? "Paid" : "Received"} ${amount} - ${t.merchant}`,
        category_id: categoryMap.get(t.category.toLowerCase()) ?? categoryMap.get(`${t.category.toLowerCase()} (${t.direction.toLowerCase()})`) ?? categoryMap.get("others") ?? null,
        source: body.source === "receipt" ? "receipt" as const : t.source,
        confidence: t.confidence,
        raw_text: body.text ?? "(image)",
        needs_review: needsReview,
        transaction_at: normalizedAt,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("transactions")
      .insert(inserts)
      .select();

    if (insertError) {
      log(requestId, "insert_failed", { error: insertError.message, code: insertError.code, details: insertError.details });
      return jsonResponse(500, { status: "error", message: "❌ Couldn't save — please try again" });
    }

    const categoryById = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

    const lines = (inserted ?? []).map((t: { amount: number; currency: string; merchant: string; direction: string; category_id: string | null; needs_review: boolean; original_amount: number | null; original_currency: string | null }) => {
      const arrow = t.direction === "expense" ? "−" : "+";
      const cat = t.category_id ? (categoryById.get(t.category_id) ?? "Others") : "Others";
      const review = t.needs_review ? " ⚠︎" : "";
      const main = fmtMoney(Number(t.amount), t.currency);
      const orig = t.original_currency && t.original_amount != null
        ? ` (${fmtMoney(Number(t.original_amount), t.original_currency)})`
        : "";
      return `${arrow}${main}${orig} · ${t.merchant} · ${cat}${review}`;
    });

    const header = inserted && inserted.length > 1
      ? `✅ Saved ${inserted.length} transactions`
      : "✅ Saved";

    const message = `${header}\n${lines.join("\n")}`;

    log(requestId, "done", { inserted: inserted?.length ?? 0, totalMs: Date.now() - startedAt });

    return jsonResponse(200, { status: "ok", entries: inserted, message });
  } catch (e) {
    const err = e as Error;
    log(requestId, "unhandled_error", { error: err.message, stack: err.stack, totalMs: Date.now() - startedAt });
    // Internals stay in server logs; the client gets only the requestId for correlation.
    return jsonResponse(500, { status: "error", message: `❌ Server error — ref ${requestId}` });
  }
});
