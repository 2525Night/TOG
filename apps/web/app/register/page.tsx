"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

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
        <h1>הרשמה ל־MoneyTail</h1>
        <label className="field">
          <span>שם להצגה</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="למשל: אורי"
          />
        </label>
        <label className="field">
          <span>אימייל</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          />
        </label>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn" disabled={loading} type="submit">
          {loading ? "יוצר חשבון…" : "צרו חשבון"}
        </button>
        <p className="muted">
          כבר רשומים? <Link href="/login">התחברות</Link>
        </p>
      </form>
    </main>
  );
}
