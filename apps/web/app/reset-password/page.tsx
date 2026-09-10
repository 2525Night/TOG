"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLockup } from "@/components/BrandLockup";
import { api } from "@/lib/api";

function ResetPasswordInner() {
  const search = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => search.get("token") || "", [search]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("חסר קישור איפוס תקין — בקשו קישור חדש");
      return;
    }
    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (password !== confirm) {
      setError("הסיסמאות לא תואמות");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
      window.setTimeout(() => router.push("/login"), 1600);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "לא הצלחנו לעדכן את הסיסמה — נסו שוב",
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
          <p>בחרו סיסמה חדשה — ואפשר לחזור למסע.</p>
        </section>
        <form
          className="auth-panel auth-rise auth-rise-delay"
          onSubmit={onSubmit}
        >
          <h1 className="auth-panel-title">איפוס סיסמה</h1>
          {!token && (
            <p className="form-error" role="alert">
              הקישור חסר או לא תקין.{" "}
              <Link href="/forgot-password">בקשו קישור חדש</Link>
            </p>
          )}
          <label className="field">
            <span>סיסמה חדשה (לפחות 8 תווים)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy || !token || done}
            />
          </label>
          <label className="field">
            <span>אימות סיסמה</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={busy || !token || done}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="form-success" role="status">
              הסיסמה עודכנה — מעבירים להתחברות…
            </p>
          )}
          <button
            className="btn auth-submit"
            type="submit"
            disabled={busy || !token || done}
          >
            {busy ? "שומרים…" : "שמירת סיסמה חדשה"}
          </button>
          <p className="auth-meta-row">
            <Link href="/login">חזרה להתחברות</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-shell">טוען…</main>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
