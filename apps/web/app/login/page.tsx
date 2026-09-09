"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api, setToken } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) emailRef.current?.focus();
  }, [error]);

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
    <main className="auth-shell auth-shell--phone">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy">
          <BrandLockup size="lg" onLight />
          <p>שמחים שחזרתם — התמונה מחכה לכם.</p>
        </section>
        <form className="auth-panel" onSubmit={onSubmit} noValidate>
          <h1 className="auth-panel-title">התחברות</h1>
          <label className="field">
            <span>אימייל</span>
            <input
              ref={emailRef}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
            />
          </label>
          <label className="field">
            <span>סיסמה</span>
            <div className="field-password">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="אופציונלי בשלב זה"
                enterKeyHint="go"
              />
              <button
                type="button"
                className="field-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "הסתרת סיסמה" : "הצגת סיסמה"}
              >
                {showPassword ? "הסתר" : "הצג"}
              </button>
            </div>
            <span className="field-hint">
              בשלב זה אפשר להשאיר ריק אם עדיין לא הגדרתם סיסמה. אם כן —
              הזינו אותה כאן.
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn auth-submit" disabled={loading} type="submit">
            {loading ? "מתחברים…" : "היכנסו"}
          </button>
          <div className="auth-footer-links">
            <Link className="btn secondary auth-secondary" href="/register">
              הצטרפות קצרה
            </Link>
            <p className="muted auth-forgot">
              <Link href="/forgot-password">שכחתי סיסמה</Link>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
