// The currencies Frankfurter (ECB reference rates) supports. This is the single
// source of truth for both the account-currency picker and conversion coverage.
export const SUPPORTED_CURRENCIES: { code: string; name: string }[] = [
  { code: "AUD", name: "Australian Dollar" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "DKK", name: "Danish Krone" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "INR", name: "Indian Rupee" },
  { code: "ISK", name: "Icelandic Krona" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KRW", name: "South Korean Won" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "RON", name: "Romanian Leu" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "USD", name: "US Dollar" },
  { code: "ZAR", name: "South African Rand" },
];

const SUPPORTED_SET = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_SET.has(code.toUpperCase());
}
