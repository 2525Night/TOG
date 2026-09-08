"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatIls } from "@/lib/api";
import { appHref } from "@/components/PeriodBar";

type Props = {
  loanId: string;
  loanName: string;
  monthlyPayment: number;
  month: string;
  /** When true, submit is blocked (already recorded this month). */
  alreadyPaidThisMonth?: boolean;
  /** When true, loan principal is 0 — no further payments. */
  loanClosed?: boolean;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
};

function defaultBookedDate(month: string) {
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  const inMonth =
    now.getFullYear() === y && now.getMonth() + 1 === m
      ? now
      : new Date(y, m - 1, 15);
  return inMonth.toISOString().slice(0, 10);
}

export function LoanPaymentPanel({
  loanId,
  loanName,
  monthlyPayment,
  month,
  alreadyPaidThisMonth = false,
  loanClosed = false,
  onDone,
  onCancel,
}: Props) {
  const [amount, setAmount] = useState(
    monthlyPayment > 0 ? String(monthlyPayment) : "",
  );
  const [bookedAt, setBookedAt] = useState(() => defaultBookedDate(month));
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ amount: number } | null>(null);

  useEffect(() => {
    setAmount(monthlyPayment > 0 ? String(monthlyPayment) : "");
    setBookedAt(defaultBookedDate(month));
    setDescription("");
    setError(null);
    setSaved(null);
  }, [loanId, month, monthlyPayment]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loanClosed || alreadyPaidThisMonth) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("נא להזין סכום תקין");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          direction: "EXPENSE",
          amount: amt,
          categoryKey: "loans",
          description:
            description.trim() || `תשלום הלוואה · ${loanName}`,
          bookedAt: `${bookedAt}T12:00:00.000Z`,
          economicRole: "LOAN_PAYMENT",
          loanId,
        }),
      });
      setSaved({ amount: amt });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  if (loanClosed) {
    return (
      <div className="loan-pay-panel loan-pay-panel--done">
        <p className="badge good" style={{ margin: 0 }}>
          ההלוואה סגורה · יתרה 0
        </p>
        <p className="muted debts-item-hint">
          אין צורך בתשלום נוסף. ההיסטוריה נשמרת בתנועות.
        </p>
        <div className="debt-post-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            סיום
          </button>
          <Link
            className="linkish"
            href={`${appHref("/app/money", month)}&loanId=${loanId}`}
          >
            לתנועות
          </Link>
        </div>
      </div>
    );
  }

  if (alreadyPaidThisMonth) {
    return (
      <div className="loan-pay-panel loan-pay-panel--done">
        <p className="badge good" style={{ margin: 0 }}>
          כבר נרשם תשלום בחודש {month}
        </p>
        <p className="muted debts-item-hint">
          אפשר לרשום שוב רק אחרי מחיקת התשלום הקיים בתנועות.
        </p>
        <div className="debt-post-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            סיום
          </button>
          <Link
            className="linkish"
            href={`${appHref("/app/money", month)}&loanId=${loanId}`}
          >
            לתנועות
          </Link>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="loan-pay-panel loan-pay-panel--done">
        <p className="badge good" style={{ margin: 0 }}>
          נרשם תשלום · {formatIls(saved.amount)}
        </p>
        <p className="muted debts-item-hint">
          ירד מעו״ש ומיתרת ההלוואה.
        </p>
        <div className="debt-post-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            סיום
          </button>
          <Link
            className="linkish"
            href={`${appHref("/app/money", month)}&loanId=${loanId}`}
          >
            לתנועות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="loan-pay-panel compact-form" onSubmit={onSubmit}>
      <p className="debts-totals-eyebrow">רשום תשלום</p>
      <p className="muted debt-wizard-hint">
        נרשם בתנועות כתשלום הלוואה — יורד מעו״ש ומיתרת «{loanName}».
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-2">
        <label className="field">
          <span>סכום</span>
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>תאריך</span>
          <input
            type="date"
            value={bookedAt}
            onChange={(e) => setBookedAt(e.target.value)}
            required
          />
        </label>
      </div>
      <label className="field">
        <span>תיאור (אופציונלי)</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`תשלום הלוואה · ${loanName}`}
        />
      </label>
      {monthlyPayment > 0 && Number(amount) !== monthlyPayment && (
        <button
          type="button"
          className="linkish"
          onClick={() => setAmount(String(monthlyPayment))}
        >
          השתמש בהחזר החודשי · {formatIls(monthlyPayment)}
        </button>
      )}
      <div className="debt-wizard-nav">
        <button className="btn" type="submit" disabled={busy}>
          שמירת תשלום
        </button>
        <button
          type="button"
          className="linkish"
          disabled={busy}
          onClick={onCancel}
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
