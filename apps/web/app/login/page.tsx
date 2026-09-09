"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, setToken } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";

export default function LoginPage() {
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
      // Full navigation avoids stale auth/onboarding state in the app shell.
      window.location.assign(
        res.user?.onboardingCompleted === false ? "/app/onboarding" : "/app",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "לא הצלחנו להתחבר — בדקו את הפרטים ונסו שוב",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy">
          <BrandLockup size="lg" onLight />
          <p>שמחים שחזרתם — התמונה מחכה לכם.</p>
        </section>
        <form className="auth-panel" onSubmit={onSubmit}>
          <h1 className="auth-panel-title">התחברות</h1>
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
            <span>סיסמה (אם הגדרתם)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="אפשר גם להשאיר ריק"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" disabled={loading} type="submit">
            {loading ? "מתחברים…" : "היכנסו"}
          </button>
          <p className="muted" style={{ marginBottom: 0 }}>
            חדשים כאן? <Link href="/register">הצטרפות קצרה</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
