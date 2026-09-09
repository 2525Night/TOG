"use client";

import { FormEvent, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3001";

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
  _count: { transactions: number; accounts: number; goals: number };
};

export default function AdminPage() {
  const [email, setEmail] = useState("admin@moneytail.local");
  const [password, setPassword] = useState("Pa$$word");
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "שגיאת התחברות");
      if (body.user?.role !== "ADMIN") {
        throw new Error("המשתמש אינו מנהל");
      }
      setToken(body.accessToken);
      await loadUsers(body.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
  }

  async function loadUsers(accessToken: string) {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "שגיאה בטעינת משתמשים");
    setUsers(body);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>
      <h1>MoneyTail5 · לוח מנהל</h1>
      <p style={{ color: "#9ca3af" }}>
        ניהול משתמשים בסיסי · Roey אינו חלק ממסך זה
      </p>

      {!token ? (
        <form
          onSubmit={login}
          style={{
            display: "grid",
            gap: "0.75rem",
            maxWidth: 360,
            background: "#1f2937",
            padding: "1rem",
            borderRadius: 12,
          }}
        >
          <label>
            אימייל מנהל
            <input
              style={{ width: "100%", marginTop: 4, padding: 8 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            סיסמה
            <input
              type="password"
              style={{ width: "100%", marginTop: 4, padding: 8 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p style={{ color: "#f87171" }}>{error}</p>}
          <button type="submit" style={{ padding: "0.7rem", fontWeight: 700 }}>
            התחברות מנהל
          </button>
        </form>
      ) : (
        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <strong>משתמשים</strong>
            <button
              type="button"
              onClick={() => loadUsers(token).catch((e) => setError(String(e)))}
            >
              רענון
            </button>
          </div>
          {error && <p style={{ color: "#f87171" }}>{error}</p>}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "#1f2937",
              }}
            >
              <thead>
                <tr>
                  <th style={th}>אימייל</th>
                  <th style={th}>שם</th>
                  <th style={th}>תפקיד</th>
                  <th style={th}>חשבונות</th>
                  <th style={th}>תנועות</th>
                  <th style={th}>יעדים</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{u.displayName || "—"}</td>
                    <td style={td}>{u.role}</td>
                    <td style={td}>{u._count.accounts}</td>
                    <td style={td}>{u._count.transactions}</td>
                    <td style={td}>{u._count.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

const th: import("react").CSSProperties = {
  textAlign: "right",
  padding: "0.65rem",
  borderBottom: "1px solid #374151",
};
const td: import("react").CSSProperties = {
  padding: "0.65rem",
  borderBottom: "1px solid #374151",
};
