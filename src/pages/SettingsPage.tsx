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
