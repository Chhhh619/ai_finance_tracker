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
