import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X, Image as ImageIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { fetchTransactions, createManualTransaction, updateTransaction, deleteTransaction } from "../lib/api";
import { supabase } from "../lib/supabase";
import { addToQueue, getQueue } from "../lib/offline-queue";
import GradientPieChart from "../components/GradientPieChart";
import CategoryPicker from "../components/CategoryPicker";
import type { Category, Transaction } from "../types";

const moneyFmt = (n: number) =>
  `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const relativeDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const txDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - txDay.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
};

interface HomePageProps {
  categories: Category[];
  onDataChanged: () => void;
  displayName: string;
  onSetName: (name: string) => void;
}

type TimePeriod = "day" | "week" | "month";

export default function HomePage({ categories, onDataChanged, displayName, onSetName }: HomePageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState<TimePeriod>("month");
  const [showChart, setShowChart] = useState(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [showCapture, setShowCapture] = useState(false);
  const [captureMode, setCaptureMode] = useState<"ai" | "manual">("manual");
  const [captureStatus, setCaptureStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMerchant, setEditMerchant] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showFab, setShowFab] = useState(true);
  const [chartCategoryId, setChartCategoryId] = useState<string | null>(null);
  const lastScrollY = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual form state
  const [manualAmount, setManualAmount] = useState("");
  const [manualMerchant, setManualMerchant] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [inputText, setInputText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleTap = (t: Transaction) => {
    if (editingId === t.id) return;
    setDetailId(detailId === t.id ? null : t.id);
    setEditingId(null);
  };

  const startLongPress = (t: Transaction) => {
    longPressTimer.current = setTimeout(() => {
      setEditingId(t.id);
      setDetailId(null);
      setEditAmount(String(t.amount));
      setEditMerchant(t.merchant);
      setEditCategory(t.category_id ?? "");
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleSaveEdit = async (id: string) => {
    const amount = parseFloat(editAmount);
    if (!amount || !editMerchant.trim()) return;
    const updated = await updateTransaction(id, {
      amount,
      merchant: editMerchant.trim(),
      category_id: editCategory || undefined,
      needs_review: false,
    });
    setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
    onDataChanged();
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setEditingId(null);
    setDetailId(null);
    onDataChanged();
  };

  const getDateRange = useCallback((p: TimePeriod): [string, string] => {
    const now = new Date();
    let from: Date;
    if (p === "day") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (p === "week") {
      const dayOfWeek = now.getDay();
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return [from.toISOString(), to.toISOString()];
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [fromDate, toDate] = getDateRange(period);
      const txns = await fetchTransactions({ from_date: fromDate, to_date: toDate, limit: 100 });
      setTransactions(txns);

      const expenseTotal = txns
        .filter((t) => t.direction === "expense")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      setTotal(expenseTotal);
    } catch {
      // Will retry when auth token refreshes
    }
  }, [period, getDateRange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const scrollingUp = y < lastScrollY.current;
      if (scrollingUp && y < lastScrollY.current - 10) {
        setShowFab(true);
      } else if (!scrollingUp && y > lastScrollY.current + 10) {
        setShowFab(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (categories.length > 0 && !manualCategory) {
      setManualCategory(categories[0].id);
    }
  }, [categories, manualCategory]);

  const breakdown = useMemo(() => {
    const totals = new Map<string, { category: Category; total: number }>();
    for (const t of transactions) {
      if (t.direction !== "expense" || !t.category) continue;
      const existing = totals.get(t.category.id);
      if (existing) existing.total += Number(t.amount);
      else totals.set(t.category.id, { category: t.category, total: Number(t.amount) });
    }
    const items = [...totals.values()].sort((a, b) => b.total - a.total);
    const grandTotal = items.reduce((s, i) => s + i.total, 0) || 1;
    return items.map((i) => ({
      ...i,
      percentage: (i.total / grandTotal) * 100,
    }));
  }, [transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = new Date(t.transaction_at).toDateString();
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([dateStr, txns]) => ({
      label: relativeDate(txns[0].transaction_at),
      date: dateStr,
      transactions: txns,
      dayTotal: txns.filter((t) => t.direction === "expense").reduce((s, t) => s + Number(t.amount), 0),
    }));
  }, [transactions]);

  const periodLabel = period === "day" ? "today" : period === "week" ? "this week" : "this month";

  // Name dialog handlers
  const openNameDialog = () => {
    setNameInput(displayName);
    setShowNameDialog(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const submitName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) {
      onSetName(trimmed);
    }
    setShowNameDialog(false);
  };

  // Capture handlers
  const sendToIngest = async (opts: { text?: string; image?: string; source: "auto" | "receipt" }) => {
    const { data: settings } = await supabase.from("user_settings").select("api_key").single();
    if (!settings?.api_key) throw new Error("API key not found");

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.api_key}` },
      body: JSON.stringify({ ...opts, timestamp: new Date().toISOString() }),
    });
    return response.json();
  };

  const handleAnalyzeText = async () => {
    const text = inputText.trim();
    if (!text) return;
    setIsProcessing(true);
    setCaptureStatus("Analyzing...");

    if (!navigator.onLine) {
      addToQueue(text, "manual");
      setCaptureStatus(`Offline. Queued (${getQueue().length} pending).`);
      setIsProcessing(false);
      setInputText("");
      return;
    }

    try {
      const result = await sendToIngest({ text, source: "auto" });
      if (result.status === "ok") {
        setCaptureStatus(result.message);
        setInputText("");
        onDataChanged();
        void loadData();
      } else {
        const debugMsg = result.debug ? `\n[Debug: ${JSON.stringify(result.debug).slice(0, 300)}]` : "";
        setCaptureStatus((result.message ?? "No transaction detected.") + debugMsg);
      }
    } catch (err) {
      addToQueue(text, "manual");
      setCaptureStatus(`Failed: ${err instanceof Error ? err.message : "unknown"}. Queued for later.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoCapture = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setCaptureStatus("Processing image...");

    try {
      const file = files[0];

      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setCaptureStatus("Sending to AI for analysis...");
      const result = await sendToIngest({ image: base64, source: "receipt" });

      if (result.status === "ok") {
        setCaptureStatus(result.message);
        onDataChanged();
        void loadData();
      } else {
        const debugMsg = result.debug ? `\n[Debug: ${JSON.stringify(result.debug).slice(0, 300)}]` : "";
        setCaptureStatus((result.message ?? "No transaction detected.") + debugMsg);
      }
    } catch {
      setCaptureStatus("Failed to process image. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(manualAmount);
    if (!amount || !manualMerchant.trim()) return;
    setIsProcessing(true);
    try {
      await createManualTransaction({
        amount, merchant: manualMerchant.trim(), category_id: manualCategory,
        direction: "expense", source: "manual",
      });
      setCaptureStatus(`Recorded RM${amount.toFixed(2)} - ${manualMerchant.trim()}`);
      setManualAmount(""); setManualMerchant("");
      onDataChanged(); void loadData();
    } catch { setCaptureStatus("Failed to save."); }
    finally { setIsProcessing(false); }
  };

  return (
    <div className="px-6 pt-4 pb-6">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-[2.2rem] leading-[1.25] tracking-tight font-semibold">
          <button onClick={openNameDialog} className="text-[#4169e1] hover:text-[#3151c1] transition-colors">
            {displayName}
          </button>
          , You have spent{" "}
          <button onClick={() => setShowChart(true)} className="text-[#4169e1] hover:text-[#3151c1] transition-colors">
            {moneyFmt(total)}
          </button>{" "}
          <button
            onClick={() => setShowPeriodPicker(true)}
            className="text-[#4169e1] hover:text-[#3151c1] transition-colors underline decoration-dashed underline-offset-4"
          >
            {periodLabel}
          </button>
          .
        </h1>
      </div>

      {/* Breakdown Chart */}
      {breakdown.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Breakdown</h2>
          <div className="bg-gray-50 rounded-2xl p-4 -mx-1">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={breakdown.slice(0, 6).map(({ category, total: catTotal }) => ({
                  name: category.name,
                  amount: catTotal,
                  color: category.color,
                }))}
                margin={{ top: 8, right: 12, left: -8, bottom: 4 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                  width={45}
                />
                <Tooltip
                  formatter={(value: number) => [moneyFmt(value), "Amount"]}
                  contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 13 }}
                  cursor={{ fill: "rgba(65,105,225,0.06)", radius: 8 }}
                />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]} barSize={32}>
                  {breakdown.slice(0, 6).map(({ category }) => (
                    <Cell key={category.id} fill={category.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Recent</h2>
        {groupedTransactions.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No transactions yet.</p>
        ) : (
          <div className="space-y-6">
            {groupedTransactions.map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400">{group.label}</span>
                  <span className="text-xs text-gray-400">-{moneyFmt(group.dayTotal)}</span>
                </div>
                <div className="space-y-0.5">
                  {group.transactions.map((t) => (
                    <div key={t.id}>
                      {/* Edit mode (long press) */}
                      {editingId === t.id ? (
                        <div className="p-3 rounded-2xl space-y-2.5 mb-1 bg-gradient-to-br from-[#4169e1]/5 via-[#4169e1]/[0.03] to-transparent border border-[#4169e1]/10">
                          <input
                            type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*"
                            className="w-full h-11 px-3 bg-white rounded-lg text-sm outline-none"
                            placeholder="Amount" value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value.replace(",", "."))}
                          />
                          <input
                            type="text"
                            className="w-full h-11 px-3 bg-white rounded-lg text-sm outline-none"
                            placeholder="Merchant" value={editMerchant}
                            onChange={(e) => setEditMerchant(e.target.value)}
                          />
                          <button
                            onClick={() => setShowCatPicker(true)}
                            className="w-full h-11 px-3 bg-white rounded-lg text-sm text-left flex items-center gap-2 touch-manipulation"
                          >
                            {(() => {
                              const cat = categories.find((c) => c.id === editCategory);
                              return cat ? (
                                <>
                                  <div className="w-5 h-5 rounded-md text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color }}>{cat.name[0]}</div>
                                  <span>{cat.name}</span>
                                </>
                              ) : <span className="text-gray-400">Select category</span>;
                            })()}
                          </button>
                          <div className="flex gap-2">
                            <button
                              onPointerUp={() => setEditingId(null)}
                              className="flex-1 h-11 bg-white rounded-lg text-sm font-medium active:bg-gray-100 transition-colors select-none touch-manipulation"
                            >
                              Cancel
                            </button>
                            <button
                              onPointerUp={() => void handleSaveEdit(t.id)}
                              className="flex-1 h-11 bg-[#4169e1] text-white rounded-lg text-sm font-medium active:bg-[#3151c1] transition-colors select-none touch-manipulation"
                            >
                              Save
                            </button>
                          </div>
                          <button
                            onPointerUp={() => void handleDelete(t.id)}
                            className="w-full h-11 bg-red-50 text-red-500 rounded-lg text-sm font-medium active:bg-red-100 transition-colors select-none touch-manipulation"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <div>
                          {/* Normal row (tap = detail, long press = edit) */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleTap(t)}
                            onTouchStart={() => startLongPress(t)}
                            onTouchEnd={cancelLongPress}
                            onTouchMove={cancelLongPress}
                            onMouseDown={() => startLongPress(t)}
                            onMouseUp={cancelLongPress}
                            onMouseLeave={cancelLongPress}
                            className="flex items-center justify-between min-h-[44px] py-2.5 border-b border-gray-50 last:border-0 active:bg-gray-50/50 rounded-lg transition-colors cursor-pointer select-none touch-manipulation"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
                                style={{ backgroundColor: t.category?.color ?? "#9298a6" }}
                              >
                                {(t.category?.name ?? "?")[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-[15px] truncate">{t.merchant}</div>
                                <div className="text-xs text-gray-400">
                                  {t.category?.name ?? "Uncategorized"}
                                  {t.needs_review && <span className="ml-1.5 text-amber-500">*</span>}
                                </div>
                              </div>
                            </div>
                            <div className="text-right ml-4 shrink-0">
                              <div className="font-semibold text-[15px]">-{moneyFmt(Number(t.amount))}</div>
                              <div className="text-[10px] text-gray-400">
                                {new Date(t.transaction_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          </div>

                          {/* Detail panel (tap to expand) */}
                          {detailId === t.id && (
                            <div className="px-3 py-3 mb-1 bg-gray-50 rounded-xl text-sm space-y-1.5">
                              <div className="flex justify-between">
                                <span className="text-gray-400">Date</span>
                                <span>{new Date(t.transaction_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Merchant</span>
                                <span>{t.merchant}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Category</span>
                                <span style={{ color: t.category?.color }}>{t.category?.name ?? "Uncategorized"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Source</span>
                                <span className="capitalize">{t.source}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Amount</span>
                                <span className="font-semibold">RM{Number(t.amount).toFixed(2)}</span>
                              </div>
                              {t.confidence < 1 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Confidence</span>
                                  <span>{Math.round(t.confidence * 100)}%</span>
                                </div>
                              )}
                              <p className="text-xs text-gray-400 pt-1">Long press to edit</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add FAB */}
      <button
        onClick={() => setShowCapture(true)}
        className={`fixed bottom-24 right-5 w-14 h-14 bg-[#4169e1] text-white rounded-2xl shadow-lg shadow-[#4169e1]/30 flex items-center justify-center active:scale-95 transition-all duration-300 z-20 ${
          showFab ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
        }`}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ─── Name Dialog ─── */}
      <AnimatePresence>
        {showNameDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowNameDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed left-6 right-6 top-1/3 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto p-6"
            >
              <h2 className="text-lg font-semibold mb-1">What should we call you?</h2>
              <p className="text-sm text-gray-400 mb-4">This is shown on your dashboard.</p>
              <input
                ref={nameInputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitName(); }}
                className="w-full h-12 px-4 bg-gray-50 rounded-xl text-base outline-none focus:ring-2 focus:ring-[#4169e1]/20 mb-4"
                placeholder="Your name"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNameDialog(false)}
                  className="flex-1 h-11 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 active:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitName}
                  className="flex-1 h-11 rounded-xl text-sm font-medium bg-[#4169e1] text-white active:bg-[#3151c1] transition-colors"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Time Period Picker ─── */}
      <AnimatePresence>
        {showPeriodPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowPeriodPicker(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl z-50 max-w-md mx-auto safe-bottom"
            >
              <div className="p-6">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                <h2 className="text-lg font-semibold mb-4">Time Period</h2>
                <div className="space-y-2">
                  {([
                    { value: "day" as const, label: "Today" },
                    { value: "week" as const, label: "This Week" },
                    { value: "month" as const, label: "This Month" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setPeriod(opt.value); setShowPeriodPicker(false); }}
                      className={`w-full py-3.5 px-4 rounded-2xl text-left text-[15px] font-medium transition-all ${
                        period === opt.value
                          ? "bg-[#4169e1] text-white"
                          : "bg-gray-50 text-gray-700 active:bg-gray-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Chart Modal (amount tap) ─── */}
      <AnimatePresence>
        {showChart && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => { setShowChart(false); setChartCategoryId(null); }}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-x-4 top-12 bottom-12 bg-white rounded-3xl shadow-2xl z-50 max-w-md mx-auto overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-bold">{moneyFmt(total)}</h2>
                  <button onClick={() => { setShowChart(false); setChartCategoryId(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-gray-400 mb-6">Spending {periodLabel}</p>

                {/* Chart */}
                {breakdown.length > 0 ? (
                  <>
                    <div className="flex justify-center mb-8">
                      <GradientPieChart
                        segments={breakdown.map((b) => ({ percentage: b.percentage, color: b.category.color }))}
                        size={200}
                      />
                    </div>

                    {/* Category cards */}
                    <div className="space-y-2.5">
                      {breakdown.map(({ category, total: catTotal, percentage }) => (
                        <div key={category.id}>
                          <button
                            onClick={() => setChartCategoryId(chartCategoryId === category.id ? null : category.id)}
                            className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-colors text-left ${
                              chartCategoryId === category.id ? "bg-gray-100" : "bg-gray-50 active:bg-gray-100"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                                style={{ backgroundColor: category.color }}
                              >
                                {category.name[0]}
                              </div>
                              <div>
                                <div className="font-medium text-[15px]">{category.name}</div>
                                <div className="text-xs text-gray-400">{Math.round(percentage)}%</div>
                              </div>
                            </div>
                            <div className="font-semibold">{moneyFmt(catTotal)}</div>
                          </button>

                          {/* Expanded transaction list for this category */}
                          <AnimatePresence>
                            {chartCategoryId === category.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-1.5 pb-1 px-2 space-y-0.5">
                                  {transactions
                                    .filter((t) => t.direction === "expense" && t.category_id === category.id)
                                    .map((t) => (
                                      <div key={t.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white">
                                        <div className="min-w-0">
                                          <div className="font-medium text-[14px] truncate">{t.merchant}</div>
                                          <div className="text-[11px] text-gray-400">
                                            {new Date(t.transaction_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                                            {" "}
                                            {new Date(t.transaction_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                                          </div>
                                        </div>
                                        <div className="font-semibold text-[14px] ml-4 shrink-0">-{moneyFmt(Number(t.amount))}</div>
                                      </div>
                                    ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm py-8 text-center">No spending data yet.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Capture Modal ─── */}
      <AnimatePresence>
        {showCapture && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCapture(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl z-50 max-w-md mx-auto safe-bottom"
            >
              <div className="p-6">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold">Add Transaction</h2>
                  <button onClick={() => setShowCapture(false)} className="p-1.5 hover:bg-gray-100 rounded-full">
                    <X size={18} />
                  </button>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-5">
                  <button
                    onClick={() => setCaptureMode("manual")}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      captureMode === "manual" ? "bg-[#4169e1] text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => setCaptureMode("ai")}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      captureMode === "ai" ? "bg-[#4169e1] text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    AI Parse
                  </button>
                </div>

                {captureMode === "manual" ? (
                  <form onSubmit={(e) => void handleManualSubmit(e)} className="space-y-3">
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*"
                      className="w-full h-12 px-4 bg-gray-50 rounded-xl text-base outline-none focus:ring-2 focus:ring-[#4169e1]/20"
                      placeholder="Amount (RM)" value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value.replace(",", "."))} required
                    />
                    <input
                      type="text"
                      className="w-full h-12 px-4 bg-gray-50 rounded-xl text-base outline-none focus:ring-2 focus:ring-[#4169e1]/20"
                      placeholder="Merchant name" value={manualMerchant} onChange={(e) => setManualMerchant(e.target.value)} required
                    />
                    <select
                      className="w-full h-12 px-4 bg-gray-50 rounded-xl text-base outline-none appearance-none"
                      value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}
                    >
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      className="w-full h-12 bg-[#4169e1] text-white rounded-xl font-medium active:scale-[0.98] transition-all disabled:opacity-50"
                      type="submit" disabled={isProcessing}
                    >
                      {isProcessing ? "Saving..." : "Record"}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      className="w-full h-28 p-4 bg-gray-50 rounded-xl text-base outline-none resize-none focus:ring-2 focus:ring-[#4169e1]/20"
                      placeholder="Paste notification or receipt text..."
                      value={inputText} onChange={(e) => setInputText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        className="flex-1 h-12 bg-[#4169e1] text-white rounded-xl font-medium active:scale-[0.98] transition-all disabled:opacity-50"
                        onClick={() => void handleAnalyzeText()} disabled={isProcessing}
                      >
                        {isProcessing ? "Analyzing..." : "Analyze"}
                      </button>
                      <button
                        className="h-12 w-12 bg-gray-100 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                        onClick={() => fileInputRef.current?.click()} disabled={isProcessing}
                        title="Upload photo"
                      >
                        <ImageIcon size={20} className="text-gray-600" />
                      </button>
                    </div>
                    <input
                      ref={fileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { void handlePhotoCapture(e.currentTarget.files); e.currentTarget.value = ""; }}
                    />
                  </div>
                )}

                {captureStatus && <pre className="mt-3 text-xs text-gray-500 whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-2">{captureStatus}</pre>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Category Picker */}
      <CategoryPicker
        open={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        categories={categories}
        selected={editCategory}
        onSelect={setEditCategory}
      />
    </div>
  );
}
