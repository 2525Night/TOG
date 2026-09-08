"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, formatIls } from "@/lib/api";
import { PeriodBar, useSelectedMonth, appHref } from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { DebtsSubNav } from "@/components/DebtsSubNav";
import { DebtSplitMeter } from "@/components/DebtSplitMeter";
import { LoanPaymentPanel } from "@/components/LoanPaymentPanel";
import { ConfirmPanel } from "@/components/ConfirmPanel";

type LoanDetail = {
  id: string;
  name: string;
  provider: string | null;
  originalAmount: number;
  principalBalance: number;
  monthlyPayment: number;
  aprPercent: number | null;
  startDate: string | null;
  endDate: string | null;
  nextDueDate: string | null;
  notes: string | null;
  repaidAmount: number;
  progressPct: number;
  remainingPayments: number | null;
  estimatedMonthlyInterest: number | null;
  estimatedPrincipalInPayment: number | null;
  transactions: Array<{
    id: string;
    amount: number;
    description: string | null;
    economicRole: string;
    bookedAt: string;
  }>;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL");
}

function LoanDetailInner() {
  const params = useParams();
  const id = String(params.id || "");
  const month = useSelectedMonth();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [original, setOriginal] = useState("");
  const [principal, setPrincipal] = useState("");
  const [monthly, setMonthly] = useState("");
  const [apr, setApr] = useState("");
  const [due, setDue] = useState("");

  async function load() {
    const res = await api<LoanDetail>(`/loans/${id}`);
    setLoan(res);
    setOriginal(String(res.originalAmount));
    setPrincipal(String(res.principalBalance));
    setMonthly(String(res.monthlyPayment || ""));
    setApr(res.aprPercent != null ? String(res.aprPercent) : "");
    setDue(res.nextDueDate ? res.nextDueDate.slice(0, 10) : "");
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה"),
    );
  }, [id]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!loan) return;
    setBusy(true);
    try {
      await api(`/loans/${loan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          originalAmount: Number(original),
          principalBalance: Number(principal),
          monthlyPayment: Number(monthly || 0),
          aprPercent: apr.trim() === "" ? null : Number(apr),
          nextDueDate: due || null,
        }),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!loan) return;
    setRemoveConfirm(true);
  }

  async function executeRemove() {
    if (!loan) return;
    setRemoveConfirm(false);
    await api(`/loans/${loan.id}`, { method: "DELETE" });
    window.location.href = appHref("/app/debts/loans", month);
  }

  if (!loan && !error) return <p className="muted">טוען…</p>;
  if (error && !loan) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!loan) return null;

  const paidThisMonth = loan.transactions.some((t) => {
    if (t.economicRole !== "LOAN_PAYMENT") return false;
    const d = new Date(t.bookedAt);
    if (Number.isNaN(d.getTime())) return false;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return key === month;
  });

  return (
    <div className="stack debts-page">
      <PageHeader
        kicker="הלוואה"
        title={loan.name}
        subtitle={loan.provider || "פרטי הלוואה"}
        actions={
          <button
            type="button"
            className="btn"
            disabled={loan.principalBalance <= 0.001 && !payOpen}
            onClick={() => {
              setPayOpen((v) => !v);
              setMoreOpen(false);
              setEditing(false);
              setMsg(null);
            }}
          >
            {payOpen
              ? "סגור תשלום"
              : loan.principalBalance <= 0.001
                ? "הלוואה סגורה"
                : paidThisMonth
                  ? "תשלום החודש"
                  : "רשום תשלום"}
          </button>
        }
        footer={<DebtsSubNav />}
      />
      <PeriodBar />
      <Link href={appHref("/app/debts/loans", month)} className="muted">
        ← חזרה להלוואות
      </Link>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {removeConfirm && (
        <ConfirmPanel
          title="הסרת הלוואה"
          danger
          busy={busy}
          confirmLabel="הסרה"
          message={`להסיר את «${loan.name}»?`}
          onCancel={() => setRemoveConfirm(false)}
          onConfirm={() => void executeRemove()}
        />
      )}
      {msg && <p className="badge good">{msg}</p>}

      <section className="debts-totals" aria-label="סיכום הלוואה">
        <p className="debts-totals-eyebrow">יתרה שנותרה</p>
        <div className="debts-totals-hero">
          <div>
            <span className="muted">עוד לשלם</span>
            <strong>{formatIls(loan.principalBalance)}</strong>
          </div>
          <div className="debts-totals-side">
            <div>
              <span className="muted">החזר חודשי</span>
              <strong>{formatIls(loan.monthlyPayment)}</strong>
            </div>
            <div>
              <span className="muted">תשלום הבא</span>
              <strong>{formatDate(loan.nextDueDate)}</strong>
            </div>
            <div>
              <span className="muted">הוחזר</span>
              <strong>{loan.progressPct}%</strong>
            </div>
          </div>
        </div>
        <DebtSplitMeter
          variant="loan"
          title="סכום ההלוואה"
          titleAmount={loan.originalAmount}
          emphasis={`${loan.progressPct}% הוחזר`}
          leftPct={loan.progressPct}
          leftLabel="הוחזר"
          leftAmount={loan.repaidAmount}
          rightLabel="נותר"
          rightAmount={loan.principalBalance}
        />
      </section>

      {payOpen && (
        <LoanPaymentPanel
          loanId={loan.id}
          loanName={loan.name}
          monthlyPayment={loan.monthlyPayment}
          month={month}
          alreadyPaidThisMonth={paidThisMonth}
          loanClosed={loan.principalBalance <= 0.001}
          onCancel={() => setPayOpen(false)}
          onDone={async () => {
            setMsg("התשלום נרשם");
            await load();
          }}
        />
      )}

      <div className="debts-item-primary-row">
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMoreOpen((v) => !v);
            if (!moreOpen) setPayOpen(false);
          }}
        >
          {moreOpen ? "פחות" : "עוד · פירוט ועריכה"}
        </button>
      </div>

      {moreOpen && (
        <div className="debts-item-more debts-detail-more">
          <div className="loan-parts">
            <div className="loan-parts-block">
              <span className="loan-parts-label">סכומים</span>
              <div className="debts-item-row">
                <div className="debts-item-primary">
                  <span className="muted">יתרה</span>
                  <strong>{formatIls(loan.principalBalance)}</strong>
                </div>
                <div>
                  <span className="muted">מקורי</span>
                  <strong>{formatIls(loan.originalAmount)}</strong>
                </div>
                <div>
                  <span className="muted">הוחזר</span>
                  <strong>{formatIls(loan.repaidAmount)}</strong>
                </div>
              </div>
            </div>

            <div className="loan-parts-block">
              <span className="loan-parts-label">החזר חודשי</span>
              <div className="debts-item-row">
                <div className="debts-item-primary">
                  <span className="muted">תשלום</span>
                  <strong>{formatIls(loan.monthlyPayment)}</strong>
                </div>
                <div>
                  <span className="muted">ריבית משוערת</span>
                  <strong>
                    {loan.estimatedMonthlyInterest != null
                      ? formatIls(loan.estimatedMonthlyInterest)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span className="muted">לקרן</span>
                  <strong>
                    {loan.estimatedPrincipalInPayment != null
                      ? formatIls(loan.estimatedPrincipalInPayment)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span className="muted">ריבית שנתית</span>
                  <strong>
                    {loan.aprPercent != null ? `${loan.aprPercent}%` : "—"}
                  </strong>
                </div>
              </div>
              <p className="muted loan-parts-hint">
                {loan.aprPercent != null
                  ? "פיצול ריבית/קרן הוא הערכה — לא לוח סילוקין בנקאי."
                  : "בלי ריבית שנתית אי אפשר להעריך כמה מההחזר הולך לריבית."}
              </p>
            </div>

            <div className="loan-parts-block loan-parts-block--schedule">
              <span className="loan-parts-label">לוח זמנים</span>
              <div className="debts-item-row">
                <div>
                  <span className="muted">תשלום הבא</span>
                  <strong>{formatDate(loan.nextDueDate)}</strong>
                </div>
                <div>
                  <span className="muted">תשלומים שנותרו</span>
                  <strong>{loan.remainingPayments ?? "—"}</strong>
                </div>
                <div>
                  <span className="muted">סיום משוער</span>
                  <strong>{formatDate(loan.endDate)}</strong>
                </div>
                <div>
                  <span className="muted">התחלה</span>
                  <strong>{formatDate(loan.startDate)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="debt-post-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "סגור עריכה" : "עריכת הלוואה"}
            </button>
            <button
              type="button"
              className="linkish muted"
              onClick={onRemove}
            >
              הסרה
            </button>
          </div>

          {editing && (
            <form className="compact-form" onSubmit={onSave}>
              <div className="grid grid-2">
                <label className="field">
                  <span>סכום מקורי</span>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={original}
                    onChange={(e) => setOriginal(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>יתרה שנותרה</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="grid grid-2">
                <label className="field">
                  <span>תשלום חודשי</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>ריבית שנתית %</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={apr}
                    onChange={(e) => setApr(e.target.value)}
                    placeholder="אופציונלי"
                  />
                </label>
              </div>
              <label className="field">
                <span>תשלום הבא</span>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <button className="btn" type="submit" disabled={busy}>
                שמירה
              </button>
            </form>
          )}

          <section>
            <div className="loan-card-head">
              <h2 style={{ margin: 0, fontSize: "1rem" }}>תשלומים מקושרים</h2>
              <Link
                className="linkish"
                href={`${appHref("/app/money", month)}&loanId=${loan.id}`}
              >
                לתנועות
              </Link>
            </div>
            {loan.transactions.length === 0 ? (
              <p className="muted debts-item-hint">
                אין תנועות משויכות. אפשר לשייך תשלום ממסך התנועות.
              </p>
            ) : (
              <ul className="debts-tx-list">
                {loan.transactions.map((t) => (
                  <li key={t.id}>
                    <span>{formatDate(t.bookedAt)}</span>
                    <span>{t.description || "תשלום הלוואה"}</span>
                    <strong>{formatIls(t.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function LoanDetailPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <LoanDetailInner />
    </Suspense>
  );
}
