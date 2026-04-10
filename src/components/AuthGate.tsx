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
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <p className="text-[2rem] font-semibold tracking-tight">PocketRinggit</p>
        <div className="mt-4 w-5 h-5 border-2 border-gray-300 border-t-[#4169e1] rounded-full animate-spin" />
      </div>
    );
  }

  if (session === null) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
