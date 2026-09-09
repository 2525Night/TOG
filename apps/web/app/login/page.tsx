"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, setToken } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";
import { ClarityGate } from "@/components/ClarityGate";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5A2.5 2.5 0 1 0 12 9a2.5 2.5 0 0 0 0 5z"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.1 2.3 2 3.4l3.1 3.1C3.2 8 2.1 9.6 1.5 11S5 18 12 18c1.6 0 3-.3 4.2-.7l3.4 3.4 1.1-1.1L3.1 2.3zM12 7c.5 0 1 .1 1.4.3L9.3 11.4A3 3 0 0 1 12 7zm0 9c-4.5 0-7.2-3.2-8.3-5 .5-.8 1.3-1.9 2.4-2.9l2.1 2.1A5 5 0 0 0 14.8 15l1.5 1.5c-1.3.3-2.7.5-4.3.5zm9.5-5S18.5 18 12 18c-.4 0-.7 0-1.1-.1l1.7 1.7c.4 0 .9.1 1.4.1 7 0 10.5-7 10.5-7-.4-.7-1.1-1.7-2.1-2.7l-1.5 1.5c.7.7 1.2 1.4 1.6 2z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gateHref, setGateHref] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) emailRef.current?.focus();
  }, [error]);

  const finishGate = useCallback(() => {
    if (!gateHref) return;
    window.location.assign(gateHref);
  }, [gateHref]);

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
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setToken(res.accessToken);
      setGateHref(
        res.user?.onboardingCompleted === false ? "/app/onboarding" : "/app",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "לא הצלחנו להתחבר — בדקו את הפרטים ונסו שוב",
      );
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell auth-shell--phone auth-shell--mood">
      {gateHref && (
        <ClarityGate
          message="רק רגע… התמונה בדרך"
          onDone={finishGate}
        />
      )}
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy auth-rise">
          <BrandLockup size="lg" />
          <p>שמחים שחזרתם — התמונה מחכה לכם.</p>
        </section>
        <form
          className="auth-panel auth-rise auth-rise-delay"
          onSubmit={onSubmit}
          noValidate
        >
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
              disabled={!!gateHref}
            />
          </label>
          <label className="field">
            <span className="field-label-row">
              סיסמה
              <span className="auth-chip">אופציונלי כרגע</span>
            </span>
            <div className="field-password">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="השאירו ריק אם אין"
                enterKeyHint="go"
                disabled={!!gateHref}
              />
              <button
                type="button"
                className="field-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "הסתרת סיסמה" : "הצגת סיסמה"}
                title={showPassword ? "הסתר" : "הצג"}
                disabled={!!gateHref}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            <span className="field-hint">אם כבר הגדרתם סיסמה — הזינו אותה.</span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn auth-submit"
            disabled={loading || !!gateHref}
            type="submit"
          >
            {loading || gateHref ? "מתחברים…" : "היכנסו"}
          </button>
          <p className="auth-meta-row">
            <Link href="/register">הצטרפות קצרה</Link>
            <span aria-hidden="true">·</span>
            <Link href="/forgot-password">שכחתי סיסמה</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
