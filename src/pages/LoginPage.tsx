import { useState } from "react";
import { signInWithMagicLink } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSending(true);
    setStatus("Sending magic link...");

    const { error } = await signInWithMagicLink(email.trim());
    if (error) {
      setStatus(`Error: ${error}`);
    } else {
      setStatus("Check your email for the magic link!");
    }
    setIsSending(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="app-brand">PocketRinggit AI</p>
        <h1>Sign In</h1>
        <p className="login-subtitle">Enter your email to receive a magic link.</p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <input
            type="email"
            className="text-input login-email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <button className="button button-primary login-button" type="submit" disabled={isSending}>
            {isSending ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        {status && <p className="status-line">{status}</p>}
      </div>
    </div>
  );
}
