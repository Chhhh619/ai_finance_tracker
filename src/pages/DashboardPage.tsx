import { useEffect, useMemo, useState } from "react";
import { fetchTransactions, fetchMonthlyTotal, fetchNeedsReviewCount } from "../lib/api";
import type { Category, Transaction } from "../types";

const moneyFormatter = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
const dateFormatter = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" });

interface DashboardPageProps {
  categories: Category[];
}

export default function DashboardPage({}: DashboardPageProps) {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const now = new Date();
    void Promise.all([
      fetchTransactions({ limit: 10 }),
      fetchMonthlyTotal(now.getFullYear(), now.getMonth()),
      fetchNeedsReviewCount(),
    ]).then(([txns, total, count]) => {
      setRecentTransactions(txns);
      setMonthTotal(total);
      setReviewCount(count);
    });
  }, []);

  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return recentTransactions
      .filter((t) => new Date(t.transaction_at).toDateString() === today && t.direction === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [recentTransactions]);

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, { category: Category; total: number }>();
    for (const t of recentTransactions) {
      if (t.direction !== "expense" || !t.category) continue;
      const existing = totals.get(t.category.id);
      if (existing) {
        existing.total += Number(t.amount);
      } else {
        totals.set(t.category.id, { category: t.category, total: Number(t.amount) });
      }
    }
    return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [recentTransactions]);

  const maxCategoryTotal = spendByCategory[0]?.total ?? 1;

  return (
    <>
      <header className="hero-card">
        <p className="hero-kicker">PocketRinggit AI</p>
        <h1>Budget Autopilot</h1>
        <p className="hero-subtitle">Malaysia-focused finance tracking with AI extraction.</p>

        <div className="hero-metrics">
          <div className="metric-card">
            <span>This month</span>
            <strong>{moneyFormatter.format(monthTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Today</span>
            <strong>{moneyFormatter.format(todayTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Needs review</span>
            <strong>{reviewCount}</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <h2>Top Categories</h2>
          <span className="tag">This month</span>
        </div>
        {spendByCategory.length === 0 ? (
          <p className="empty-state">No transactions yet. Use an iOS Shortcut or manual Capture.</p>
        ) : (
          <div className="bar-list">
            {spendByCategory.map(({ category, total }) => (
              <div key={category.id} className="bar-row">
                <div className="bar-label-row">
                  <span>{category.name}</span>
                  <strong>{moneyFormatter.format(total)}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max((total / maxCategoryTotal) * 100, 8)}%`,
                      backgroundColor: category.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Latest Entries</h2>
          <span className="tag">{recentTransactions.length} recent</span>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="empty-state">Your transaction timeline will appear here.</p>
        ) : (
          <ul className="entry-list">
            {recentTransactions.slice(0, 6).map((t) => (
              <li key={t.id} className="entry-item">
                <div className="entry-main">
                  <p className="entry-merchant">
                    {t.merchant}
                    {t.needs_review && <span className="review-dot" title="Needs review" />}
                  </p>
                  <p className="entry-description">{t.description}</p>
                  <p className="entry-meta">
                    {dateFormatter.format(new Date(t.transaction_at))} | {t.source}
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
