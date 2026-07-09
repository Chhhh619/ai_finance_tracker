// Client-side Frankfurter fetch, used only by the "Retry conversion" action on
// records that failed conversion at capture time. The API is CORS-open.
export async function fetchRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[to];
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  }
}

export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
