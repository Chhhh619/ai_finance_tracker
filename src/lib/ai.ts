import { z } from "zod";
import type { CategoryOption, ParsedTransaction } from "../types";

const entrySchema = z.object({
  merchant: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  categoryName: z.string().optional(),
  timestamp: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const responseSchema = z.object({
  entries: z.array(entrySchema).min(1)
});

function extractJsonContent(content: string): unknown | null {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i);
  const payload = fencedMatch?.[1] ?? content;

  try {
    return JSON.parse(payload);
  } catch {
    const objectMatch = payload.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      return null;
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

export async function analyzeWithOpenRouter(
  rawText: string,
  categories: CategoryOption[]
): Promise<ParsedTransaction[] | null> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = import.meta.env.VITE_OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";
  const categoryNames = categories.map((item) => item.name).join(", ");

  const systemPrompt = [
    "You are a finance extraction assistant for Malaysia transactions.",
    "Parse raw receipt or payment notification text.",
    "Return strict JSON with this exact shape:",
    '{"entries":[{"merchant":"...","description":"...","amount":0,"categoryName":"...","timestamp":"ISO optional","confidence":0.0}]}',
    "Rules:",
    "- Amount must be positive numeric values in MYR.",
    "- Split multiple line items into separate entries if possible.",
    `- Category must be one of: ${categoryNames}.`,
    "- If unsure, use Others.",
    "- Do not include markdown, explanation, or extra keys."
  ].join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  const parsed = extractJsonContent(content);
  if (!parsed) {
    return null;
  }

  const validated = responseSchema.safeParse(parsed);
  if (!validated.success) {
    return null;
  }

  return validated.data.entries;
}
