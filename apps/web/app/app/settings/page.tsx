"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { PeriodBar, useSelectedMonth } from "@/components/PeriodBar";

type HouseholdStatus =
  | {
      linked: boolean;
      role: "partner";
      owner: { id: string; displayName: string } | null;
      partnerLabelHe: string | null;
    }
  | {
      linked: boolean;
      role: "owner";
      partners: Array<{ id: string; displayName: string }>;
      activeInvite: {
        code: string;
        labelHe: string | null;
        expiresAt: string | null;
      } | null;
    };

type BankStatus = {
  uiEnabled: boolean;
  available: boolean;
  status: string;
  reasonHe: string;
};

function SettingsInner() {
  const month = useSelectedMonth();
  const [household, setHousehold] = useState<HouseholdStatus | null>(null);
  const [bank, setBank] = useState<BankStatus | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, b] = await Promise.all([
      api<HouseholdStatus>("/household/status"),
      api<BankStatus>("/bank-link/status"),
    ]);
    setHousehold(h);
    setBank(b);
    if (h.role === "owner" && h.activeInvite) {
      setInviteCode(h.activeInvite.code);
    }
  }, []);

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הגדרות"),
    );
  }, [load]);

  async function createInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ code: string }>("/household/invite", {
        method: "POST",
        body: JSON.stringify({ labelHe: "בן/בת זוג" }),
      });
      setInviteCode(res.code);
      setMsg("נוצר קוד הזמנה — שתפו אותו עם בן/בת הזוג בפרטיות");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function redeem(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/household/redeem", {
        method: "POST",
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      setMsg("מחוברים למשק בית משותף — אותה תמונה, ביחד");
      setRedeemCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await api("/household/link", { method: "DELETE" });
      setInviteCode(null);
      setMsg("השיתוף נותק — כל אחד חוזר למסע שלו");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function tryBankConnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; reasonHe?: string }>(
        "/bank-link/connect",
        { method: "POST" },
      );
      setMsg(res.reasonHe || "חיבור בנק עדיין לא זמין");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack debts-page">
      <PageHeader
        kicker="הגדרות"
        title="שיתוף וחיבורים"
        subtitle="חום בזהירות — בלי רעש. שיתוף זוגי ואופציות עתידיות לבנק."
      />
      <PeriodBar />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p className="badge good" role="status">
          {msg}
        </p>
      )}

      <section className="card" aria-label="שיתוף זוגי">
        <p className="debts-totals-eyebrow">שיתוף זוגי</p>
        <h2 style={{ marginTop: 0 }}>לא לבד במסע</h2>
        <p className="muted">
          הזמנה פרטית לבן/בת זוג — אותה תמונת מצב, בלי פיד ציבורי ובלי תחרות מי
          חסך יותר.
        </p>

        {household?.role === "partner" && household.linked && (
          <div>
            <p>
              מחוברים למשק של{" "}
              <strong>{household.owner?.displayName || "שותף"}</strong>
            </p>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => void unlink()}
            >
              ניתוק שיתוף
            </button>
          </div>
        )}

        {household?.role === "owner" && (
          <div className="stack" style={{ gap: "0.85rem" }}>
            {household.partners?.length > 0 && (
              <p>
                שותפים מחוברים:{" "}
                {household.partners.map((p) => p.displayName).join(" · ")}
              </p>
            )}
            <form onSubmit={createInvite}>
              <button className="btn" type="submit" disabled={busy}>
                {inviteCode ? "חדשו קוד הזמנה" : "צרו קוד הזמנה"}
              </button>
            </form>
            {inviteCode && (
              <p className="badge" data-testid="household-invite-code">
                קוד: <strong>{inviteCode}</strong>
              </p>
            )}
            {(household.partners?.length > 0 || inviteCode) && (
              <button
                type="button"
                className="linkish muted"
                disabled={busy}
                onClick={() => void unlink()}
              >
                ניתוק / ביטול הזמנות
              </button>
            )}
          </div>
        )}

        {household && household.role !== "partner" && (
          <form
            className="compact-form"
            style={{ marginTop: "1rem" }}
            onSubmit={redeem}
          >
            <label className="field">
              <span>יש לכם קוד הזמנה?</span>
              <input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="למשל A1B2C3"
                minLength={4}
                required
                disabled={busy}
              />
            </label>
            <button className="btn secondary" type="submit" disabled={busy}>
              הצטרפות למשק בית
            </button>
          </form>
        )}
      </section>

      {bank?.uiEnabled && (
        <section className="card" aria-label="חיבור בנק אופציונלי">
          <p className="debts-totals-eyebrow">חיבור בנק (אופציונלי)</p>
          <h2 style={{ marginTop: 0 }}>בנקאות פתוחה — בדרך</h2>
          <p className="muted">{bank.reasonHe}</p>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || !bank.available}
            onClick={() => void tryBankConnect()}
          >
            {bank.available ? "חברו בנק" : "עדיין לא זמין"}
          </button>
        </section>
      )}

      <p className="muted" style={{ fontSize: "0.9rem" }}>
        חודש פעיל בהגדרות: {month} — לא משפיע על השיתוף.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="stack">טוען הגדרות…</div>}>
      <SettingsInner />
    </Suspense>
  );
}
