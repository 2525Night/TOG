"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        user: { onboardingCompleted?: boolean };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      router.push(
        res.user?.onboardingCompleted === false ? "/app/onboarding" : "/app",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <form
        className="card"
        onSubmit={onSubmit}
        style={{ width: "min(420px, 100%)" }}
      >
        <h1>התחברות ל־MoneyTail</h1>
        <label className="field">
          <span>אימייל</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="field">
          <span>סיסמה</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn" disabled={loading} type="submit">
          {loading ? "מתחבר…" : "התחברות"}
        </button>
        <p className="muted">
          אין חשבון? <Link href="/register">הרשמה</Link>
        </p>
      </form>
    </main>
  );
}
