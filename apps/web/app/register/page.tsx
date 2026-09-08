"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      router.push("/app/onboarding");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "לא הצלחנו ליצור חשבון — נסו שוב",
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
          <p>כמה פרטים קצרים — ואז נבנה יחד תמונה ברורה של הכסף.</p>
        </section>
        <form className="auth-panel" onSubmit={onSubmit}>
          <h1 className="auth-panel-title">הצטרפות</h1>
          <label className="field">
            <span>איך לקרוא לכם?</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="למשל: אורי"
              autoComplete="nickname"
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
            />
            <span className="field-hint">שומרים אותה אצלכם — לא נשתף.</span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" disabled={loading} type="submit">
            {loading ? "יוצרים…" : "בואו נתחיל"}
          </button>
          <p className="muted" style={{ marginBottom: 0 }}>
            כבר רשומים? <Link href="/login">התחברות</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
