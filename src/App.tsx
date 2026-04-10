import { useCallback, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AuthGate from "./components/AuthGate";
import BottomNav from "./components/BottomNav";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import CapturePage from "./pages/CapturePage";
import CategoriesPage from "./pages/CategoriesPage";
import SettingsPage from "./pages/SettingsPage";
import { fetchCategories, fetchNeedsReviewCount } from "./lib/api";
import { setupOnlineSync } from "./lib/offline-queue";
import type { Category } from "./types";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/transactions": "Transactions",
  "/capture": "Capture",
  "/categories": "Categories",
  "/settings": "Settings",
};

function AppShell() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const location = useLocation();

  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories();
      setCategories(cats);
    } catch {
      // Will retry on next navigation
    }
  }, []);

  const loadReviewCount = useCallback(async () => {
    try {
      const count = await fetchNeedsReviewCount();
      setReviewCount(count);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadReviewCount();
    setupOnlineSync();
  }, [loadCategories, loadReviewCount]);

  useEffect(() => {
    void loadReviewCount();
  }, [location.pathname, refreshKey, loadReviewCount]);

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void loadReviewCount();
  }, [loadReviewCount]);

  const pageTitle = pageTitles[location.pathname] ?? "Dashboard";

  return (
    <div className="app-frame">
      <header className="app-header">
        <p className="app-brand">PocketRinggit AI</p>
        <h1>{pageTitle}</h1>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<DashboardPage categories={categories} />} />
          <Route path="/transactions" element={<TransactionsPage categories={categories} />} />
          <Route
            path="/capture"
            element={<CapturePage categories={categories} onTransactionAdded={handleDataChanged} />}
          />
          <Route
            path="/categories"
            element={<CategoriesPage categories={categories} onCategoriesChanged={loadCategories} />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <BottomNav reviewCount={reviewCount} />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </HashRouter>
  );
}
