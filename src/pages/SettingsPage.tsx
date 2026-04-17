import { useEffect, useState } from "react";
import { fetchSettings, updateSettings, fetchTransactions } from "../lib/api";
import { signOut, registerPasskey } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { getQueue, flushQueue } from "../lib/offline-queue";
import { LogOut, Fingerprint, Download, RefreshCw, ChevronRight, Copy, Check, FileSpreadsheet, FileText, Sparkles, ExternalLink, CalendarDays } from "lucide-react";
import { SHORTCUT_ICLOUD_URL } from "../lib/constants";
import BottomSheet from "../components/BottomSheet";
import DateSettingsSheet from "../components/DateSettingsSheet";
import { exportTransactionsXLSX, exportTransactionsCSV, exportFilename } from "../lib/export";
import { cn } from "../lib/utils";
import type { DuplicateHandling, UserSettings } from "../types";

const WEEK_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

interface SettingsPageProps {
  monthStartDay: number;
  weekStartDay: number;
  onSetCycleStart: (month: number, week: number) => void;
}

const duplicateOptions: { value: DuplicateHandling; label: string; desc: string }[] = [
  { value: "expenses_only", label: "Expenses only", desc: "Only record the expense side of transfers" },
  { value: "all", label: "Record all", desc: "Record both sender and receiver notifications" },
  { value: "smart_merge", label: "Smart merge", desc: "Deduplicate matching transfer amounts" },
];

export default function SettingsPage({ monthStartDay, weekStartDay, onSetCycleStart }: SettingsPageProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [status, setStatus] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showDupPicker, setShowDupPicker] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [showDateSettings, setShowDateSettings] = useState(false);

  useEffect(() => {
    void fetchSettings().then(setSettings);
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
    setQueueCount(getQueue().length);
  }, []);

  const handleDuplicateChange = async (value: DuplicateHandling) => {
    try {
      const updated = await updateSettings({ duplicate_handling: value });
      setSettings(updated);
    } catch { setStatus("Failed to update."); }
  };

  const handleRegisterPasskey = async () => {
    setStatus("Setting up...");
    const { error } = await registerPasskey();
    setStatus(error ?? "Face ID enabled!");
  };

  const handleExport = async (kind: "xlsx" | "csv") => {
    setStatus("Exporting...");
    try {
      const txns = await fetchTransactions({ limit: 10000 });
      const filename = exportFilename(kind);
      if (kind === "xlsx") exportTransactionsXLSX(txns, filename);
      else exportTransactionsCSV(txns, filename);
      setStatus("Exported!");
    } catch { setStatus("Export failed."); }
  };

  const handleFlushQueue = async () => {
    const { synced, failed } = await flushQueue();
    setQueueCount(getQueue().length);
    setStatus(`Synced ${synced}, failed ${failed}.`);
  };

  const handleCopyKey = async () => {
    if (!settings?.api_key) return;
    try {
      await navigator.clipboard.writeText(settings.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy key:", err);
    }
  };

  if (!settings) {
    return (
      <div className="px-6 pt-4 pb-6">
        <h1 className="text-2xl font-semibold mb-5">Settings</h1>
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-[#4169e1] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-4 pb-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      {/* Account */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Account</h2>
        <div className="bg-gray-50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white">
            <div className="text-[15px] font-medium">{userEmail}</div>
          </div>
          <button
            onClick={() => void handleRegisterPasskey()}
            className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white active:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Fingerprint size={18} className="text-gray-500" />
              <span className="text-[15px]">Enable Face ID</span>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-red-500 active:bg-gray-100 transition-colors"
          >
            <LogOut size={18} />
            <span className="text-[15px] font-medium">Sign Out</span>
          </button>
        </div>
      </section>

      {/* Duplicate Handling */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Duplicate Handling</h2>
        <p className="text-xs text-gray-400 mb-2">How to handle transfer notifications from both sender and receiver.</p>
        <button
          onClick={() => setShowDupPicker(true)}
          className="w-full h-11 px-4 bg-gray-50 rounded-xl text-[15px] text-left flex items-center justify-between"
        >
          <span>{duplicateOptions.find((o) => o.value === settings.duplicate_handling)?.label ?? "Select"}</span>
          <ChevronRight size={16} className="text-gray-300" />
        </button>
      </section>

      {/* Date Cycle */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Date Cycle</h2>
        <p className="text-xs text-gray-400 mb-2">When your monthly and weekly cycles start.</p>
        <button
          onClick={() => setShowDateSettings(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <CalendarDays size={18} className="text-gray-500 shrink-0" />
            <div className="min-w-0 text-left">
              <div className="text-[15px] font-medium">Date Settings</div>
              <div className="text-xs text-gray-500 truncate">
                Starts {ordinal(monthStartDay)} of every month · {WEEK_DAY_NAMES[weekStartDay]}
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 shrink-0" />
        </button>
      </section>

      {/* API Key */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Your Unique Key</h2>
        <p className="text-xs text-gray-400 mb-3">Paste this into your iOS Shortcut when it asks for the key.</p>
        <button
          onClick={() => void handleCopyKey()}
          disabled={copied}
          className={cn(
            "relative w-full h-12 rounded-2xl font-medium text-[15px] flex items-center justify-center gap-2.5 transition-colors disabled:opacity-100",
            copied ? "bg-emerald-50 text-emerald-600" : "bg-[#4169e1] text-white active:bg-[#3558c7]"
          )}
        >
          <span className={cn("transition-all duration-200", copied ? "scale-100 opacity-100" : "scale-0 opacity-0 absolute")}>
            <Check size={18} className="stroke-emerald-600" />
          </span>
          <span className={cn("transition-all duration-200", copied ? "scale-0 opacity-0 absolute" : "scale-100 opacity-100")}>
            <Copy size={18} />
          </span>
          {copied ? "Copied!" : "Copy your unique key"}
        </button>
      </section>

      {/* iOS Shortcut Setup */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">iOS Shortcut</h2>
        <a
          href={SHORTCUT_ICLOUD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles size={18} className="text-[#4169e1] shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-medium">Add PocketRinggit Capture</div>
              <div className="text-xs text-gray-500">Open in Shortcuts, then paste your API key</div>
            </div>
          </div>
          <ExternalLink size={16} className="text-gray-400 shrink-0" />
        </a>
      </section>

      {/* Offline Queue */}
      {queueCount > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Offline Queue</h2>
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl">
            <span className="text-sm text-amber-700">{queueCount} entries pending</span>
            <button
              onClick={() => void handleFlushQueue()}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-700"
            >
              <RefreshCw size={14} /> Sync
            </button>
          </div>
        </section>
      )}

      {/* Data */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Data</h2>
        <button
          onClick={() => setShowExportPicker(true)}
          className="flex items-center gap-3 px-4 py-3.5 bg-gray-50 rounded-2xl w-full active:bg-gray-100 transition-colors"
        >
          <Download size={18} className="text-gray-500" />
          <span className="text-[15px]">Export Transactions</span>
        </button>
      </section>

      {status && <p className="text-sm text-center text-gray-500 mt-2">{status}</p>}

      {/* Duplicate Handling Picker */}
      <BottomSheet open={showDupPicker} onClose={() => setShowDupPicker(false)}>
        <h2 className="text-lg font-semibold mb-4">Duplicate Handling</h2>
        <div className="space-y-2 min-w-[45vw] max-w-full">
          {duplicateOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                void handleDuplicateChange(opt.value);
                setShowDupPicker(false);
              }}
              className={`w-full px-5 py-3.5 rounded-2xl text-left transition-all touch-manipulation ${
                settings.duplicate_handling === opt.value
                  ? "bg-[#4169e1] text-white"
                  : "bg-gray-50 text-gray-700 active:bg-gray-100"
              }`}
            >
              <div className="font-medium text-[15px]">{opt.label}</div>
              <div className={`text-xs mt-0.5 ${
                settings.duplicate_handling === opt.value ? "text-white/70" : "text-gray-400"
              }`}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </BottomSheet>

      <DateSettingsSheet
        open={showDateSettings}
        onClose={() => setShowDateSettings(false)}
        monthStartDay={monthStartDay}
        weekStartDay={weekStartDay}
        onSave={onSetCycleStart}
      />

      <BottomSheet open={showExportPicker} onClose={() => setShowExportPicker(false)}>
        <h2 className="text-lg font-semibold mb-4">Export Transactions</h2>
        <div className="space-y-2">
          <button
            onClick={() => { setShowExportPicker(false); void handleExport("xlsx"); }}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <FileSpreadsheet size={18} className="text-gray-500" />
            <div>
              <div className="font-medium text-[15px]">Export as XLSX</div>
              <div className="text-xs text-gray-500">Excel spreadsheet</div>
            </div>
          </button>
          <button
            onClick={() => { setShowExportPicker(false); void handleExport("csv"); }}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <FileText size={18} className="text-gray-500" />
            <div>
              <div className="font-medium text-[15px]">Export as CSV</div>
              <div className="text-xs text-gray-500">Comma-separated values</div>
            </div>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
