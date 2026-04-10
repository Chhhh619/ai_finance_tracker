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

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", userId);

  const categoryNames = (categories ?? []).map((c: { name: string }) => c.name);
  const categoryMap = new Map((categories ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));

  const transactions = await callGeminiFlash(body.text, categoryNames, geminiApiKey);

  if (!transactions || transactions.length === 0) {
    return new Response(JSON.stringify({ status: "empty", message: "No transaction detected" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
