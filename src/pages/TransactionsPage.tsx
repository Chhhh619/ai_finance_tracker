import { useCallback, useEffect, useState } from "react";
import { fetchTransactions, updateTransaction, deleteTransaction, type TransactionFilters } from "../lib/api";
import type { Category, Transaction } from "../types";

const moneyFormatter = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const dateFormatter = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" });

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 30;

  const loadTransactions = useCallback(async (reset = false) => {
    setLoading(true);
    const newOffset = reset ? 0 : offset;
    const filters: TransactionFilters = {
      limit: PAGE_SIZE,
      offset: newOffset,
    };

    if (search) filters.search = search;
    if (filterSource) filters.source = filterSource;
    if (filterCategory) filters.category_id = filterCategory;
    if (showReviewOnly) filters.needs_review = true;

    const data = await fetchTransactions(filters);

    if (reset) {
      setTransactions(data);
      setOffset(PAGE_SIZE);
    } else {
      setTransactions((prev) => [...prev, ...data]);
      setOffset(newOffset + PAGE_SIZE);
    }
    setHasMore(data.length === PAGE_SIZE);
    setLoading(false);
  }, [search, filterSource, filterCategory, showReviewOnly, offset]);

  useEffect(() => {
    void loadTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterSource, filterCategory, showReviewOnly]);

  const handleUpdate = async (id: string, updates: Parameters<typeof updateTransaction>[1]) => {
    const updated = await updateTransaction(id, updates);
    setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Transactions</h2>
        <span className="tag">{transactions.length} shown</span>
      </div>

      <div className="filters-row">
        <input
          type="search"
          className="filter-input"
          placeholder="Search merchant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="ewallet">E-wallet</option>
          <option value="bank">Bank</option>
          <option value="manual">Manual</option>
          <option value="receipt">Receipt</option>
        </select>
        <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="filter-toggle">
          <input type="checkbox" checked={showReviewOnly} onChange={(e) => setShowReviewOnly(e.target.checked)} />
          Needs review
        </label>
      </div>

      {transactions.length === 0 && !loading ? (
        <p className="empty-state">No transactions match your filters.</p>
      ) : (
        <ul className="entry-list">
          {transactions.map((t) => (
            <li key={t.id} className={`entry-item${t.needs_review ? " needs-review" : ""}`}>
              {editingId === t.id ? (
                <div className="entry-edit">
                  <select
                    className="filter-select"
                    defaultValue={t.category_id ?? ""}
                    onChange={(e) => void handleUpdate(t.id, { category_id: e.target.value, needs_review: false })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="button button-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="button button-danger" onClick={() => void handleDelete(t.id)}>Delete</button>
                </div>
              ) : (
                <>
                  <div className="entry-main" onClick={() => setEditingId(t.id)}>
                    <p className="entry-merchant">
                      {t.merchant}
                      {t.needs_review && <span className="review-dot" title="Needs review" />}
                    </p>
                    <p className="entry-description">{t.description}</p>
                    <p className="entry-meta">
                      {dateFormatter.format(new Date(t.transaction_at))} | {t.source} | {Math.round(t.confidence * 100)}%
                    </p>
                  </div>
                  <div className="entry-side">
                    <span className="entry-category" style={{ backgroundColor: t.category?.color ?? "#9fa6b4" }}>
                      {t.category?.name ?? "Uncategorized"}
                    </span>
                    <strong className="entry-amount">
                      {t.direction === "expense" ? "-" : "+"}{moneyFormatter.format(Number(t.amount))}
                    </strong>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button className="button button-secondary load-more" onClick={() => void loadTransactions(false)} disabled={loading}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </section>
  );
}
