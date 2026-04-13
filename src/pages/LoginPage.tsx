import { useState } from "react";
import { signInWithPassword, signUpWithPassword, signInWithGoogle } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsLoading(true);
    setStatus("");

    if (isSignUp) {
      if (password.length < 6) {
        setStatus("Password must be at least 6 characters.");
        setIsLoading(false);
        return;
      }
      const { error } = await signUpWithPassword(email.trim(), password);
      if (error) {
        setStatus(error);
      } else {
        setStatus("Account created! Check your email to confirm, then sign in.");
        setIsSignUp(false);
        setPassword("");
      }
    } else {
      const { error } = await signInWithPassword(email.trim(), password);
      if (error) {
        setStatus(error);
      }
    }
    setIsLoading(false);
  };

  const handleGoogle = async () => {
    setStatus("");
    const { error } = await signInWithGoogle();
    if (error) setStatus(error);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-8 bg-white safe-top">
      <div className="max-w-sm mx-auto w-full">
        <h1 className="text-[2.5rem] leading-tight tracking-tight font-semibold mb-2">
          PocketRinggit
        </h1>
        <p className="text-gray-400 text-base mb-10">
          Track your spending effortlessly.
        </p>

        {/* Google sign in */}
        <button
          onClick={() => void handleGoogle()}
          className="w-full h-12 bg-white border border-gray-200 rounded-xl font-medium text-base flex items-center justify-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all mb-6"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Password auth */}
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <input
            type="email"
            className="w-full h-12 px-4 bg-gray-50 rounded-xl text-base outline-none focus:ring-2 focus:ring-[#4169e1]/20 transition-all"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="w-full h-12 px-4 bg-gray-50 rounded-xl text-base outline-none focus:ring-2 focus:ring-[#4169e1]/20 transition-all"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
          />
          <button
            className="w-full h-12 bg-[#4169e1] text-white rounded-xl font-medium text-base hover:bg-[#3151c1] active:scale-[0.98] transition-all disabled:opacity-50"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => { setIsSignUp(!isSignUp); setStatus(""); }}
          className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
        </button>

        {status && (
          <p className={`mt-4 text-sm text-center ${
            status.startsWith("Account created") ? "text-emerald-600" : "text-red-500"
          }`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
