import { useCallback, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthGate from "./components/AuthGate";
import BottomNav from "./components/BottomNav";
import HomePage from "./pages/HomePage";
import TransactionsPage from "./pages/TransactionsPage";
import CategoriesPage from "./pages/CategoriesPage";
import SettingsPage from "./pages/SettingsPage";
import ShortcutOnboardingModal from "./components/ShortcutOnboardingModal";
import { fetchCategories, fetchSettings, updateSettings } from "./lib/api";
import { setupOnlineSync } from "./lib/offline-queue";
import { onAuthStateChange } from "./lib/auth";
import { SHORTCUT_ONBOARDING_FLAG } from "./lib/constants";
import type { Category } from "./types";

function AppShell() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [displayName, setDisplayName] = useState("Friend");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showShortcutOnboarding, setShowShortcutOnboarding] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories();
      setCategories(cats);
    } catch {
      // retry on next navigation
    }
  }, []);

  const loadInitialData = useCallback(() => {
    void loadCategories();
    void fetchSettings().then((s) => {
      if (s.display_name) setDisplayName(s.display_name);
    }).catch(() => {});
    setRefreshKey((k) => k + 1);
  }, [loadCategories]);

  useEffect(() => {
    loadInitialData();
    setupOnlineSync();

    // Re-fetch all data when auth token refreshes (e.g., after session expiry)
    // Also: first time we see a session, prompt for shortcut onboarding.
    const unsubscribe = onAuthStateChange((session) => {
      if (session) {
        loadInitialData();
        if (!localStorage.getItem(SHORTCUT_ONBOARDING_FLAG)) {
          setShowShortcutOnboarding(true);
        }
      }
    });
    return unsubscribe;
  }, [loadInitialData]);

  const dismissShortcutOnboarding = useCallback(() => {
    localStorage.setItem(SHORTCUT_ONBOARDING_FLAG, "1");
    setShowShortcutOnboarding(false);
  }, []);

  const handleDataChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSetName = useCallback(async (name: string) => {
    setDisplayName(name);
    try {
      await updateSettings({ display_name: name });
    } catch {
      // still keep it locally even if DB update fails
    }
  }, []);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white safe-top pb-20">
      <div>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                key={refreshKey}
                categories={categories}
                onDataChanged={handleDataChanged}
                displayName={displayName}
                onSetName={handleSetName}
              />
            }
          />
          <Route path="/transactions" element={<TransactionsPage categories={categories} />} />
          <Route path="/categories" element={<CategoriesPage categories={categories} onCategoriesChanged={loadCategories} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
      <ShortcutOnboardingModal open={showShortcutOnboarding} onClose={dismissShortcutOnboarding} />
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
