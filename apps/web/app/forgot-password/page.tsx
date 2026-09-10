"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setResetPath(null);
    try {
      const res = await api<{
        ok: boolean;
        message: string;
        resetPath?: string;
      }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setMessage(res.message);
      if (res.resetPath) setResetPath(res.resetPath);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "לא הצלחנו להתחיל איפוס — נסו שוב בעוד רגע",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell auth-shell--phone auth-shell--mood">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy auth-rise">
          <BrandLockup size="lg" />
          <p>נחזיר אתכם לתמונה — בלי לחץ.</p>
        </section>
        <form
          className="auth-panel auth-rise auth-rise-delay"
          onSubmit={onSubmit}
        >
          <h1 className="auth-panel-title">שכחתי סיסמה</h1>
          <p className="auth-help-body">
            הזינו את האימייל של החשבון. נפיק קישור איפוס חד־פעמי שיפוג תוך שעה.
          </p>
          <label className="field">
            <span>אימייל</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              disabled={busy}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="form-success" role="status">
              {message}
            </p>
          )}
          {resetPath && (
            <p className="auth-help-body" role="status">
              לסביבת פיתוח מקומית:{" "}
              <Link href={resetPath}>המשיכו לאיפוס הסיסמה</Link>
            </p>
          )}
          <button className="btn auth-submit" type="submit" disabled={busy}>
            {busy ? "שולחים…" : "המשך לאיפוס"}
          </button>
          <p className="auth-meta-row">
            <Link href="/login">חזרה להתחברות</Link>
            <span aria-hidden="true">·</span>
            <Link href="/register">הצטרפות קצרה</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
