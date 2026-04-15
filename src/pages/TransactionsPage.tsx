import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchTransactions, updateTransaction, deleteTransaction, type TransactionFilters } from "../lib/api";
import { Search, CalendarDays, X, ChevronDown, ChevronLeft, ChevronRight, Check, Download, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
import Calendar, { toKey } from "../components/Calendar";
import CategoryPicker from "../components/CategoryPicker";
import BottomSheet from "../components/BottomSheet";
import Toast from "../components/Toast";
import { exportTransactionsXLSX, exportTransactionsCSV, exportFilename } from "../lib/export";
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
  if (diff < 7) return d.toLocaleDateString("en-MY", { weekday: "long" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-MY", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
};

type DateFilterMode = "all" | "day" | "week" | "month";

interface TransactionsPageProps {
  categories: Category[];
}

export default function TransactionsPage({ categories }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMerchant, setEditMerchant] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const editFormRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportSubOpen, setExportSubOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Date filter
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Custom filter pickers
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  const PAGE_SIZE = 50;

  const dateRange = useMemo((): { from?: string; to?: string; label: string } => {
    if (dateMode === "all") return { label: "All time" };

    const d = selectedDate;
    if (dateMode === "day") {
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        label: d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }),
      };
    }
    if (dateMode === "week") {
      const dayOfWeek = d.getDay();
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek);
      const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - dayOfWeek), 23, 59, 59);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        label: `${from.toLocaleDateString("en-MY", { day: "numeric", month: "short" })} – ${to.toLocaleDateString("en-MY", { day: "numeric", month: "short" })}`,
      };
    }
    // month
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      label: d.toLocaleDateString("en-MY", { month: "long", year: "numeric" }),
    };
  }, [dateMode, selectedDate]);

  const loadTransactions = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const newOffset = reset ? 0 : offset;
      const filters: TransactionFilters = { limit: PAGE_SIZE, offset: newOffset };
      if (search) filters.search = search;
      if (filterSource) filters.source = filterSource;
      if (filterCategory) filters.category_id = filterCategory;
      if (showReviewOnly) filters.needs_review = true;
      if (dateRange.from) filters.from_date = dateRange.from;
      if (dateRange.to) filters.to_date = dateRange.to;

      const data = await fetchTransactions(filters);
      if (reset) { setTransactions(data); setOffset(PAGE_SIZE); }
      else { setTransactions((prev) => [...prev, ...data]); setOffset(newOffset + PAGE_SIZE); }
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // Will retry when auth token refreshes
    } finally {
      setLoading(false);
    }
  }, [search, filterSource, filterCategory, showReviewOnly, offset, dateRange]);

  useEffect(() => {
    void loadTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterSource, filterCategory, showReviewOnly, dateRange]);

  // Close edit view on outside click or Esc
  useEffect(() => {
    if (!editingId) return;
    const handlePointer = (e: PointerEvent) => {
      if (showEditDatePicker || showCatPicker) return;
      const target = e.target as Node | null;
      if (editFormRef.current && target && !editFormRef.current.contains(target)) {
        setEditingId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingId(null);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [editingId, showEditDatePicker, showCatPicker]);

  // Build set of dates with transactions for calendar dots
  const activeDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      set.add(toKey(new Date(t.transaction_at)));
    }
    return set;
  }, [transactions]);

  const periodTotal = useMemo(() =>
    transactions.filter((t) => t.direction === "expense").reduce((s, t) => s + Number(t.amount), 0),
  [transactions]);

  const handleTap = (t: Transaction) => {
    if (selectionMode) { toggleSelected(t.id); return; }
    if (editingId === t.id) return;
    setDetailId(detailId === t.id ? null : t.id);
    setEditingId(null);
  };

  const startLongPress = (t: Transaction) => {
    if (selectionMode) return;
    setPressingId(t.id);
    holdTimer.current = setTimeout(() => setHeldId(t.id), 200);
    longPressTimer.current = setTimeout(() => {
      setEditingId(t.id);
      setDetailId(null);
      setEditAmount(String(t.amount));
      setEditMerchant(t.merchant);
      setEditCategory(t.category_id ?? "");
      setEditDate(new Date(t.transaction_at));
      setPressingId(null);
      setHeldId(null);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setPressingId(null);
    setHeldId(null);
  };

  const handleSaveEdit = async (id: string) => {
    const amount = parseFloat(editAmount);
    if (!amount || !editMerchant.trim()) return;
    const updated = await updateTransaction(id, {
      amount,
      merchant: editMerchant.trim(),
      category_id: editCategory || undefined,
      needs_review: false,
      transaction_at: editDate.toISOString(),
    });
    setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setEditingId(null);
    setDetailId(null);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    if (dateMode === "all") setDateMode("day");
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMoreOpen(false);
    setExportSubOpen(false);
  };

  const selectedTransactions = useMemo(
    () => transactions.filter((t) => selectedIds.has(t.id)),
    [transactions, selectedIds]
  );

  const handleExport = (kind: "xlsx" | "csv") => {
    const filename = exportFilename(kind);
    const count = selectedTransactions.length;
    if (kind === "xlsx") exportTransactionsXLSX(selectedTransactions, filename);
    else exportTransactionsCSV(selectedTransactions, filename);
    setToastMsg(`Exported ${count} transactions`);
    exitSelection();
  };

  const handleConfirmDelete = async () => {
    const ids = Array.from(selectedIds);
    const total = ids.length;
    setShowDeleteConfirm(false);
    const results = await Promise.allSettled(ids.map((id) => deleteTransaction(id)));
    const ok: string[] = [];
    results.forEach((r, i) => { if (r.status === "fulfilled") ok.push(ids[i]); });
    const okSet = new Set(ok);
    setTransactions((prev) => prev.filter((t) => !okSet.has(t.id)));
    const failed = total - ok.length;
    setToastMsg(failed === 0 ? `Deleted ${total} transactions` : `Deleted ${ok.length} of ${total} — ${failed} failed`);
    exitSelection();
  };

  // Close More popover on outside pointerdown
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target && !target.closest("[data-more-popover]")) {
        setMoreOpen(false);
        setExportSubOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [moreOpen]);

  // Group transactions by date
  const grouped = (() => {
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
  })();

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-30 bg-white px-6 pt-4 pb-3">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <button
          onClick={() => setShowCalendar(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl text-sm text-gray-600 active:bg-gray-100 transition-colors touch-manipulation"
        >
          <CalendarDays size={16} />
          <span className="max-w-[120px] truncate">{dateRange.label}</span>
        </button>
      </div>

      {/* Date mode pills */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex gap-2">
          {(["all", "day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setDateMode(m)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all touch-manipulation ${
                dateMode === m ? "bg-[#4169e1] text-white" : "bg-gray-50 text-gray-500 active:bg-gray-100"
              }`}
            >
              {m === "all" ? "All" : m === "day" ? "Day" : m === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 relative" data-more-popover>
          {selectionMode && (
            <button
              onClick={exitSelection}
              aria-label="Cancel selection"
              className="h-8 w-8 flex items-center justify-center rounded-xl bg-gray-50 text-gray-600 active:bg-gray-100 touch-manipulation"
            >
              <X size={14} />
            </button>
          )}
          {selectionMode && selectedIds.size > 0 && (
            <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
          )}
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="h-8 px-3 rounded-xl text-xs font-medium bg-gray-50 text-gray-600 active:bg-gray-100 transition-colors touch-manipulation"
            >
              Select
            </button>
          ) : (
            <>
              <button
                onClick={() => { if (selectedIds.size > 0) setMoreOpen((v) => !v); }}
                disabled={selectedIds.size === 0}
                className={`h-8 px-3 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors touch-manipulation ${
                  selectedIds.size === 0
                    ? "bg-[#4169e1]/40 text-white cursor-not-allowed"
                    : "bg-[#4169e1] text-white active:bg-[#3151c1]"
                }`}
              >
                More <ChevronDown size={12} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-xl bg-white shadow-lg border border-gray-100 z-50 overflow-hidden">
                  {!exportSubOpen ? (
                    <>
                      <button
                        onClick={() => setExportSubOpen(true)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                      >
                        <span className="flex items-center gap-2.5"><Download size={16} className="text-gray-500" />Export</span>
                        <ChevronRight size={14} className="text-gray-400" />
                      </button>
                      <button
                        onClick={() => { setMoreOpen(false); setShowDeleteConfirm(true); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 active:bg-red-100 border-t border-gray-50"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setExportSubOpen(false)}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-50"
                      >
                        <ChevronLeft size={14} /> Back
                      </button>
                      <button
                        onClick={() => { handleExport("xlsx"); setMoreOpen(false); setExportSubOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                      >
                        <FileSpreadsheet size={16} className="text-gray-500" />
                        Export as XLSX
                      </button>
                      <button
                        onClick={() => { handleExport("csv"); setMoreOpen(false); setExportSubOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 border-t border-gray-50"
                      >
                        <FileText size={16} className="text-gray-500" />
                        Export as CSV
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Period total */}
      {dateMode !== "all" && (
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold">-{moneyFmt(periodTotal)}</span>
          <span className="text-xs text-gray-400">{dateRange.label}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          className="w-full h-11 pl-10 pr-4 bg-gray-50 rounded-xl text-[15px] outline-none focus:ring-2 focus:ring-[#4169e1]/20"
          placeholder="Search merchant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setShowSourcePicker(true)}
          className={`h-9 px-3 rounded-xl text-sm flex items-center gap-1.5 transition-colors touch-manipulation ${
            filterSource ? "bg-[#4169e1] text-white" : "bg-gray-50 text-gray-600 active:bg-gray-100"
          }`}
        >
          <span>{filterSource ? { ewallet: "E-wallet", bank: "Bank", manual: "Manual", receipt: "Receipt" }[filterSource] : "All sources"}</span>
          <ChevronDown size={14} />
        </button>
        <button
          onClick={() => setShowCategoryFilter(true)}
          className={`h-9 px-3 rounded-xl text-sm flex items-center gap-1.5 transition-colors touch-manipulation ${
            filterCategory ? "bg-[#4169e1] text-white" : "bg-gray-50 text-gray-600 active:bg-gray-100"
          }`}
        >
          {filterCategory ? (
            <>
              <div
                className="w-4 h-4 rounded-md text-white text-[8px] font-bold flex items-center justify-center shrink-0"
                style={{ backgroundColor: filterCategory ? (categories.find((c) => c.id === filterCategory)?.color ?? "#9298a6") : undefined }}
              >
                {categories.find((c) => c.id === filterCategory)?.name[0] ?? ""}
              </div>
              <span>{categories.find((c) => c.id === filterCategory)?.name}</span>
            </>
          ) : (
            <span>All categories</span>
          )}
          <ChevronDown size={14} />
        </button>
        <button
          onClick={() => setShowReviewOnly(!showReviewOnly)}
          className={`h-9 px-3 rounded-xl text-sm transition-colors touch-manipulation ${
            showReviewOnly ? "bg-amber-100 text-amber-700" : "bg-gray-50 text-gray-600 active:bg-gray-100"
          }`}
        >
          Review
        </button>
      </div>

      </div>
      <div className="px-6 pt-3">
      {/* Transaction list */}
      {grouped.length === 0 && !loading ? (
        <p className="text-gray-400 text-sm py-12 text-center">
          {dateMode !== "all" ? `No transactions for ${dateRange.label}.` : "No transactions found."}
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400">{group.label}</span>
                <span className="text-xs text-gray-400">-{moneyFmt(group.dayTotal)}</span>
              </div>
              <div className="space-y-0.5">
                {group.transactions.map((t) => (
                  <div key={t.id}>
                    {editingId === t.id ? (
                      <div ref={editFormRef} className="p-3 rounded-2xl space-y-2.5 mb-1 bg-gradient-to-br from-[#4169e1]/5 via-[#4169e1]/[0.03] to-transparent border border-[#4169e1]/10">
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
                            onClick={() => setShowEditDatePicker(true)}
                            className="flex-1 h-11 px-3 bg-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 active:bg-gray-100 transition-colors select-none touch-manipulation"
                          >
                            <CalendarDays size={14} className="text-gray-500" />
                            <span className="truncate">{editDate.toLocaleDateString("en-MY", { day: "numeric", month: "short" })}, {editDate.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</span>
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
                          className={`flex items-center justify-between min-h-[44px] py-2.5 border-b border-gray-50 last:border-0 rounded-lg transition-colors duration-150 cursor-pointer select-none touch-manipulation ${selectedIds.has(t.id) ? "bg-[#4169e1]/5" : heldId === t.id ? "bg-blue-200" : pressingId === t.id ? "bg-blue-50" : "active:bg-gray-50/50"}`}
                        >
                          {selectionMode && (
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mr-3 ${
                              selectedIds.has(t.id) ? "bg-[#4169e1] border-[#4169e1]" : "border-gray-300 bg-white"
                            }`}>
                              {selectedIds.has(t.id) && <Check size={14} className="text-white" />}
                            </div>
                          )}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
                              style={{ backgroundColor: t.category?.color ?? "#9298a6" }}
                            >
                              {(t.category?.name ?? "?")[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-[15px] truncate">
                                {t.merchant}
                                {t.needs_review && <span className="ml-1.5 text-amber-500 text-xs">*</span>}
                              </div>
                              <div className="text-xs text-gray-400">{t.category?.name ?? "Uncategorized"}</div>
                            </div>
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <div className="font-semibold text-[15px]">
                              {t.direction === "expense" ? "-" : "+"}{moneyFmt(Number(t.amount))}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {new Date(t.transaction_at).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>

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

      {hasMore && (
        <button
          className="w-full mt-6 py-3 text-sm font-medium text-[#4169e1] bg-[#4169e1]/5 rounded-xl active:bg-[#4169e1]/10 transition-colors"
          onClick={() => void loadTransactions(false)} disabled={loading}
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
      </div>

      {/* Calendar bottom sheet */}
      <BottomSheet open={showCalendar} onClose={() => setShowCalendar(false)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Select Date</h2>
          <button onClick={() => setShowCalendar(false)} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setDateMode(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                dateMode === m ? "bg-[#4169e1] text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {m === "day" ? "Day" : m === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>

        <Calendar
          selected={selectedDate}
          onSelect={(d) => {
            handleDateSelect(d);
            setShowCalendar(false);
          }}
          activeDates={activeDates}
        />
      </BottomSheet>

      {/* Category Picker */}
      <CategoryPicker
        open={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        categories={categories}
        selected={editCategory}
        onSelect={setEditCategory}
      />

      {/* Edit Date/Time Picker */}
      <BottomSheet open={showEditDatePicker} onClose={() => setShowEditDatePicker(false)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Date & Time</h2>
          <button onClick={() => setShowEditDatePicker(false)} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X size={18} />
          </button>
        </div>

        <Calendar
          selected={editDate}
          onSelect={(d) => {
            const next = new Date(editDate);
            next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
            setEditDate(next);
          }}
        />

        <div className="mt-4 flex items-center justify-between gap-3 px-1">
          <span className="text-sm font-medium text-gray-600">Time</span>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={23} inputMode="numeric"
              value={String(editDate.getHours()).padStart(2, "0")}
              onChange={(e) => {
                const h = Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10)));
                const next = new Date(editDate);
                next.setHours(h);
                setEditDate(next);
              }}
              className="w-14 h-11 text-center bg-gray-50 rounded-lg text-base font-semibold outline-none focus:ring-2 focus:ring-[#4169e1]/20"
            />
            <span className="text-base font-semibold text-gray-400">:</span>
            <input
              type="number" min={0} max={59} inputMode="numeric"
              value={String(editDate.getMinutes()).padStart(2, "0")}
              onChange={(e) => {
                const m = Math.max(0, Math.min(59, parseInt(e.target.value || "0", 10)));
                const next = new Date(editDate);
                next.setMinutes(m);
                setEditDate(next);
              }}
              className="w-14 h-11 text-center bg-gray-50 rounded-lg text-base font-semibold outline-none focus:ring-2 focus:ring-[#4169e1]/20"
            />
          </div>
        </div>

        <button
          onClick={() => setShowEditDatePicker(false)}
          className="w-full mt-4 h-11 bg-[#4169e1] text-white rounded-xl text-sm font-medium active:bg-[#3151c1] transition-colors touch-manipulation"
        >
          Done
        </button>
      </BottomSheet>

      {/* Source Filter Picker */}
      <BottomSheet open={showSourcePicker} onClose={() => setShowSourcePicker(false)}>
        <h2 className="text-lg font-semibold mb-4">Source</h2>
        <div className="space-y-2">
          {[
            { value: "", label: "All sources" },
            { value: "ewallet", label: "E-wallet" },
            { value: "bank", label: "Bank" },
            { value: "manual", label: "Manual" },
            { value: "receipt", label: "Receipt" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setFilterSource(opt.value); setShowSourcePicker(false); }}
              className={`w-full py-3.5 px-4 rounded-2xl text-left text-[15px] font-medium transition-all touch-manipulation ${
                filterSource === opt.value
                  ? "bg-[#4169e1] text-white"
                  : "bg-gray-50 text-gray-700 active:bg-gray-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Category Filter Picker */}
      <BottomSheet open={showCategoryFilter} onClose={() => setShowCategoryFilter(false)}>
        <h2 className="text-lg font-semibold mb-4">Category</h2>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          <button
            onClick={() => { setFilterCategory(""); setShowCategoryFilter(false); }}
            className={`w-full py-3.5 px-4 rounded-2xl text-left text-[15px] font-medium transition-all touch-manipulation ${
              !filterCategory
                ? "bg-[#4169e1] text-white"
                : "bg-gray-50 text-gray-700 active:bg-gray-100"
            }`}
          >
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => { setFilterCategory(c.id); setShowCategoryFilter(false); }}
              className={`w-full py-3.5 px-4 rounded-2xl text-left text-[15px] font-medium flex items-center gap-3 transition-all touch-manipulation ${
                filterCategory === c.id
                  ? "bg-[#4169e1] text-white"
                  : "bg-gray-50 text-gray-700 active:bg-gray-100"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  filterCategory === c.id ? "text-[#4169e1] bg-white/90" : "text-white"
                }`}
                style={filterCategory === c.id ? undefined : { backgroundColor: c.color }}
              >
                {c.name[0]}
              </div>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <h2 className="text-lg font-semibold mb-1">Delete {selectedIds.size} transactions?</h2>
        <p className="text-sm text-gray-500 mb-4">This cannot be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:bg-gray-200 touch-manipulation"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirmDelete()}
            className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-medium active:bg-red-600 touch-manipulation"
          >
            Delete
          </button>
        </div>
      </BottomSheet>

      <Toast message={toastMsg} onDone={() => setToastMsg(null)} />
    </div>
  );
}
