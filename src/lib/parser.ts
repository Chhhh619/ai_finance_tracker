import { analyzeWithOpenRouter } from "./ai";
import type { CategoryOption, EntrySource, ParsedTransaction } from "../types";

const amountRegex = /(?:rm|myr)?\s*[-+]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})/gi;
const lineItemRegex = /^([a-z][a-z0-9 &'.,/()\-]{1,72}?)\s+(-?\d{1,4}(?:\.\d{1,2})?)$/i;

function parseAmount(rawValue: string): number | null {
  const normalized = rawValue.replace(/(?:rm|myr|\s|,)/gi, "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.abs(parsed);
}

function extractPrimaryAmount(text: string): number | null {
  const matches = text.match(amountRegex);
  if (!matches || matches.length === 0) {
    return null;
  }

  const parsed = matches
    .map(parseAmount)
    .filter((item): item is number => item !== null)
    .sort((a, b) => b - a);

  if (parsed.length === 0) {
    return null;
  }

  const signedMatch = text.match(/-\s*(?:rm|myr)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/i);
  if (signedMatch) {
    const signedAmount = parseAmount(signedMatch[1]);
    if (signedAmount !== null) {
      return signedAmount;
    }
  }

  return parsed[0];
}

function detectMerchant(text: string): string {
  const paymentPattern = text.match(/payment\s*-\s*([a-z0-9 &'.,\-]+)/i);
  if (paymentPattern?.[1]) {
    return paymentPattern[1].trim();
  }

  const merchantPattern = text.match(/merchant\s*[:\-]?\s*([a-z0-9 &'.,\-]+)/i);
  if (merchantPattern?.[1]) {
    return merchantPattern[1].trim();
  }

  const atPattern = text.match(/(?:at|to)\s+([a-z0-9 &'.,\-]{3,})/i);
  if (atPattern?.[1]) {
    return atPattern[1].trim();
  }

  const firstUsefulLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 2 && !line.match(/(?:receipt|date|time|total|transaction|wallet|status)/i));

  return firstUsefulLine ?? "Unknown Merchant";
}

function detectTimestamp(text: string): string | undefined {
  const malaysianDateMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})[\sT]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!malaysianDateMatch) {
    return undefined;
  }

  const [, day, month, year, hour, minute, second] = malaysianDateMatch;
  return `${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}`;
}

function scoreCategoryName(text: string, categories: CategoryOption[]): string {
  const normalized = text.toLowerCase();

  let bestName = "Others";
  let bestScore = 0;

  for (const category of categories) {
    if (category.keywords.length === 0) {
      continue;
    }

    let score = 0;
    for (const keyword of category.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestName = category.name;
    }
  }

  return bestName;
}

function isNoiseLine(line: string): boolean {
  return /(?:total|subtotal|tax|rounding|change|wallet ref|transaction no|status|date|time|payment method)/i.test(line);
}

function parseLineItems(text: string, categories: CategoryOption[]): ParsedTransaction[] {
  const merchant = detectMerchant(text);

  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isNoiseLine(line))
    .map((line) => {
      const match = line.match(lineItemRegex);
      if (!match) {
        return null;
      }

      const amount = parseAmount(match[2]);
      if (amount === null || amount === 0) {
        return null;
      }

      const description = match[1].trim();
      if (description.length < 2 || /^(rm|myr)$/i.test(description)) {
        return null;
      }

      return {
        merchant,
        description,
        amount,
        categoryName: scoreCategoryName(description, categories),
        confidence: 0.62
      } satisfies ParsedTransaction;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return candidates.length >= 2 ? candidates : [];
}

function parseSingleEntry(text: string, categories: CategoryOption[]): ParsedTransaction[] {
  const amount = extractPrimaryAmount(text);
  if (amount === null) {
    return [];
  }

  const merchant = detectMerchant(text);
  const timestamp = detectTimestamp(text);

  const description = merchant === "Unknown Merchant" ? "General payment" : `Payment - ${merchant}`;

  return [
    {
      merchant,
      description,
      amount,
      categoryName: scoreCategoryName(`${merchant} ${description}`, categories),
      timestamp,
      confidence: 0.55
    }
  ];
}

function sanitizeAIOutput(entries: ParsedTransaction[], categories: CategoryOption[]): ParsedTransaction[] {
  const validCategoryNames = new Set(categories.map((item) => item.name.toLowerCase()));

  return entries
    .map((entry) => {
      const normalizedCategory = entry.categoryName?.trim() ?? "Others";

      return {
        merchant: entry.merchant.trim() || "Unknown Merchant",
        description: entry.description.trim() || "General payment",
        amount: Math.abs(entry.amount),
        categoryName: validCategoryNames.has(normalizedCategory.toLowerCase()) ? normalizedCategory : "Others",
        timestamp: entry.timestamp,
        confidence: entry.confidence ?? 0.85
      } satisfies ParsedTransaction;
    })
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0);
}

export async function parseTransactions(
  rawText: string,
  categories: CategoryOption[],
  source: EntrySource
): Promise<ParsedTransaction[]> {
  const text = rawText.trim();
  if (!text) {
    return [];
  }

  const aiResult = await analyzeWithOpenRouter(text, categories);
  if (aiResult && aiResult.length > 0) {
    return sanitizeAIOutput(aiResult, categories);
  }

  if (source !== "notification" && source !== "shortcut") {
    const lineItems = parseLineItems(text, categories);
    if (lineItems.length > 0) {
      return lineItems;
    }
  }

  return parseSingleEntry(text, categories);
}
