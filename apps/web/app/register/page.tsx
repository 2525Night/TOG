"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";
import { api, setToken } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";
import { ClarityGate } from "@/components/ClarityGate";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gateHref, setGateHref] = useState<string | null>(null);

  const finishGate = useCallback(() => {
    if (!gateHref) return;
    window.location.assign(gateHref);
  }, [gateHref]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      });
      setToken(res.accessToken);
      setGateHref("/app/onboarding");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "לא הצלחנו ליצור חשבון — נסו שוב",
      );
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell auth-shell--phone auth-shell--mood">
      {gateHref && (
        <ClarityGate message="רק רגע… מתחילים" onDone={finishGate} />
      )}
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy auth-rise">
          <BrandLockup size="lg" />
          <p>כמה פרטים קצרים — ואז נבנה יחד תמונה ברורה של הכסף.</p>
        </section>
        <form
          className="auth-panel auth-rise auth-rise-delay"
          onSubmit={onSubmit}
        >
          <h1 className="auth-panel-title">הצטרפות</h1>
          <label className="field">
            <span>איך לקרוא לכם?</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="למשל: אורי"
              autoComplete="nickname"
              disabled={!!gateHref}
            />
          </label>
          <label className="field">
            <span>אימייל</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={!!gateHref}
            />
          </label>
          <label className="field">
            <span>סיסמה (לפחות 8 תווים)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={!!gateHref}
            />
            <span className="field-hint">שומרים אותה אצלכם — לא נשתף.</span>
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
            {loading || gateHref ? "יוצרים…" : "בואו נתחיל"}
          </button>
          <p className="auth-meta-row">
            <Link href="/login">התחברות</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
