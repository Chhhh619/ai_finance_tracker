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
