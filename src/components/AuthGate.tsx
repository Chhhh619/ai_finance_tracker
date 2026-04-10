import { useEffect, useState } from "react";
import { onAuthStateChange, getSession } from "../lib/auth";
import type { Session } from "@supabase/supabase-js";
import LoginPage from "../pages/LoginPage";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    getSession().then(setSession);
    const unsubscribe = onAuthStateChange(setSession);
    return unsubscribe;
  }, []);

  if (session === undefined) {
    return (
      <div className="auth-loading">
        <p className="app-brand">PocketRinggit AI</p>
        <p>Loading...</p>
      </div>
    );
  }

  if (session === null) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
