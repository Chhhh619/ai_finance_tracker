import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  text: z.string().min(1).max(10000).optional(),
  image: z.string().optional(), // base64 encoded image
  source: z.enum(["auto", "receipt"]).default("auto"),
  timestamp: z.string().optional(),
});

const transactionSchema = z.object({
  amount: z.number().positive(),
  merchant: z.string().min(1),
  direction: z.enum(["expense", "income"]),
  category: z.string().min(1),
  source: z.enum(["ewallet", "bank", "manual", "receipt"]),
  confidence: z.number().min(0).max(1),
  transaction_at: z.string().optional(),
});

const llmResponseSchema = z.array(transactionSchema);

function makeRequestId() {
  return Math.random().toString(36).slice(2, 10);
}

function log(requestId: string, stage: string, extra?: Record<string, unknown>) {
  const payload = { requestId, stage, ...(extra ?? {}) };
  console.log(JSON.stringify(payload));
}

async function callGeminiFlash(
  text: string | undefined,
  imageBase64: string | undefined,
  categoryNames: string[],
  apiKey: string,
  source: string,
  requestId: string
): Promise<z.infer<typeof llmResponseSchema> | null> {
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
    `Assign ONE category from this list: ${categoryNames.join(", ")}.`,
    "If none fit well, use 'Others' and set confidence lower.",
    "",
    "For each transaction return a JSON object with:",
    "- amount: number (positive, the final amount paid in MYR)",
    "- merchant: string (business/store name, e.g. 'McDonald's', 'Grab', 'Touch n Go')",
    '- direction: "expense" or "income"',
    "- category: string (from the list above)",
    `- source: "${source === "receipt" ? "receipt" : "manual"}" (use this exact value)`,
    "- confidence: number 0-1",
    `- transaction_at: ISO datetime string if visible, otherwise omit. The current date/time is ${new Date().toISOString()} (UTC). If the source shows only a date like "14 Apr" or "14/04" without a year, assume the current year. Never invent a year — if no date is visible at all, omit this field.`,
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

  if (parts.length === 0) return null;

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    return { transactions: null, debug: { error: "Gemini fetch threw", detail: String(e) } };
  }

  const geminiMs = Date.now() - geminiStart;
  log(requestId, "gemini_fetch_done", { status: response.status, ms: geminiMs });

  if (!response.ok) {
    const errText = await response.text();
    log(requestId, "gemini_error", { status: response.status, body: errText.slice(0, 500) });
    return { transactions: null, debug: { error: `Gemini ${response.status}`, detail: errText } };
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    log(requestId, "gemini_no_content", { raw: JSON.stringify(data).slice(0, 500) });
    return { transactions: null, debug: { error: "No content in Gemini response", raw: JSON.stringify(data).slice(0, 500) } };
  }

  try {
    const parsed = JSON.parse(content);
    const validated = llmResponseSchema.safeParse(parsed);
    if (!validated.success) {
      log(requestId, "gemini_validation_failed", { issues: validated.error.issues, output: content.slice(0, 500) });
      return { transactions: null, debug: { error: "Validation failed", llmOutput: content, zodErrors: validated.error.issues } };
    }
    log(requestId, "gemini_parsed", { count: validated.data.length });
    return { transactions: validated.data, debug: { llmOutput: content } };
  } catch (e) {
    log(requestId, "gemini_parse_failed", { error: String(e), output: content.slice(0, 500) });
    return { transactions: null, debug: { error: "JSON parse failed", llmOutput: content, parseError: String(e) } };
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
      .select("id, name")
      .eq("user_id", userId);

    if (categoriesError) {
      log(requestId, "categories_fetch_failed", { error: categoriesError.message });
    }

    const categoryNames = (categories ?? []).map((c: { name: string }) => c.name);
    const categoryMap = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));

    const geminiResult = await callGeminiFlash(body.text, body.image, categoryNames, geminiApiKey, body.source, requestId);
    const transactions = geminiResult.transactions;
    const debug = geminiResult.debug;

    if (!transactions || transactions.length === 0) {
      log(requestId, "empty_result", { totalMs: Date.now() - startedAt });
      return jsonResponse(200, { status: "empty", message: "🔍 No transaction found in this capture", debug });
    }

    let filtered = transactions;
    if (settings.duplicate_handling === "expenses_only") {
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
          filtered.push(...group.filter(t => t.direction === "expense"));
        } else {
          filtered.push(...group);
        }
      }
    } else if (settings.duplicate_handling === "smart_merge") {
      const seen = new Set<number>();
      filtered = [];
      for (const t of transactions) {
        if (t.direction === "income" && seen.has(t.amount)) continue;
        if (t.direction === "expense") seen.add(t.amount);
        filtered.push(t);
      }
    }

    log(requestId, "filtered", { before: transactions.length, after: filtered.length, mode: settings.duplicate_handling });

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
      raw_text: body.text ?? "(image)",
      needs_review: t.confidence < 0.7,
      transaction_at: t.transaction_at ?? body.timestamp ?? new Date().toISOString(),
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("transactions")
      .insert(inserts)
      .select();

    if (insertError) {
      log(requestId, "insert_failed", { error: insertError.message, code: insertError.code, details: insertError.details });
      return jsonResponse(500, { status: "error", message: "❌ Couldn't save — please try again", debug: { error: insertError.message } });
    }

    const categoryById = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

    const lines = (inserted ?? []).map((t: { amount: number; merchant: string; direction: string; category_id: string | null; needs_review: boolean }) => {
      const arrow = t.direction === "expense" ? "−" : "+";
      const cat = t.category_id ? (categoryById.get(t.category_id) ?? "Others") : "Others";
      const review = t.needs_review ? " ⚠︎" : "";
      return `${arrow}RM${Number(t.amount).toFixed(2)} · ${t.merchant} · ${cat}${review}`;
    });

    const header = inserted && inserted.length > 1
      ? `✅ Saved ${inserted.length} transactions`
      : "✅ Saved";

    const message = `${header}\n${lines.join("\n")}`;

    log(requestId, "done", { inserted: inserted?.length ?? 0, totalMs: Date.now() - startedAt });

    return jsonResponse(200, { status: "ok", entries: inserted, message, debug });
  } catch (e) {
    const err = e as Error;
    log(requestId, "unhandled_error", { error: err.message, stack: err.stack, totalMs: Date.now() - startedAt });
    return jsonResponse(500, {
      status: "error",
      message: `❌ Server error — ref ${requestId}`,
      debug: { error: err.message, stack: err.stack },
    });
  }
});
