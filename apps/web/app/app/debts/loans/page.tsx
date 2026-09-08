"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, formatIls } from "@/lib/api";
import { PeriodBar, useSelectedMonth, appHref } from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { DebtsSubNav } from "@/components/DebtsSubNav";
import { DebtSplitMeter } from "@/components/DebtSplitMeter";
import { LoanPaymentPanel } from "@/components/LoanPaymentPanel";

type Loan = {
  id: string;
  name: string;
  provider: string | null;
  originalAmount: number;
  principalBalance: number;
  monthlyPayment: number;
  aprPercent: number | null;
  nextDueDate: string | null;
  endDate: string | null;
  repaidAmount: number;
  progressPct: number;
  remainingPayments: number | null;
  estimatedMonthlyInterest: number | null;
  estimatedPrincipalInPayment: number | null;
  derived?: boolean;
};

type ListResponse = {
  month: string;
  loans: Loan[];
  overdraft: Loan | null;
  totals: {
    principal: number;
    original: number;
    repaid: number;
    monthlyPayment: number;
    activeCount: number;
    nextPaymentAmount: number | null;
    nextPaymentDate: string | null;
  };
};

type CreatedLoan = { id: string; name: string; monthlyPayment: number };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL");
}

function defaultBookedAt(month: string) {
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  const inMonth =
    now.getFullYear() === y && now.getMonth() + 1 === m
      ? now
      : new Date(y, m - 1, 15);
  return inMonth.toISOString().slice(0, 10);
}

const STEPS = [
  { id: 1, label: "מה זו ההלוואה" },
  { id: 2, label: "סכומים" },
  { id: 3, label: "החזר חודשי" },
  { id: 4, label: "תנועות" },
] as const;

function LoansInner() {
  const month = useSelectedMonth();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [original, setOriginal] = useState("");
  const [principal, setPrincipal] = useState("");
  const [monthly, setMonthly] = useState("");
  const [apr, setApr] = useState("");
  const [due, setDue] = useState("");
  const [recordPayment, setRecordPayment] = useState(false);
  const [created, setCreated] = useState<CreatedLoan | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [payOpenId, setPayOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await api<ListResponse>(
      `/loans?month=${encodeURIComponent(month)}`,
    );
    setData(res);
  }

  useEffect(() => {
    setMoreOpenId(null);
    setPayOpenId(null);
    setMsg(null);
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה"),
    );
  }, [month]);

  const origN = Number(original) || 0;
  const balN = Number(principal || original) || 0;
  const repaidPreview = Math.max(0, origN - balN);
  const progressPreview =
    origN > 0 ? Math.min(100, Math.round((repaidPreview / origN) * 100)) : 0;

  function resetForm() {
    setStep(1);
    setName("");
    setProvider("");
    setOriginal("");
    setPrincipal("");
    setMonthly("");
    setApr("");
    setDue("");
    setRecordPayment(false);
    setCreated(null);
  }

  function canNext() {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return origN > 0 && balN >= 0 && balN <= origN + 0.001;
    if (step === 3) return true;
    return true;
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canNext()) return;
    setBusy(true);
    setError(null);
    try {
      const loan = await api<CreatedLoan & { monthlyPayment: number }>(
        "/loans",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            provider: provider.trim() || undefined,
            originalAmount: origN,
            principalBalance: balN,
            monthlyPayment: Number(monthly || 0),
            aprPercent: apr ? Number(apr) : undefined,
            nextDueDate: due || undefined,
          }),
        },
      );

      const pay = Number(monthly || 0);
      if (recordPayment && pay > 0) {
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify({
            direction: "EXPENSE",
            amount: pay,
            categoryKey: "loans",
            description: `תשלום הלוואה · ${loan.name}`,
            bookedAt: `${defaultBookedAt(month)}T12:00:00.000Z`,
            economicRole: "LOAN_PAYMENT",
            loanId: loan.id,
          }),
        });
        // יתרה שמילאו כבר משקפת מצב נוכחי — לא להוריד שוב בגלל תיעוד התנועה
        await api(`/loans/${loan.id}`, {
          method: "PATCH",
          body: JSON.stringify({ principalBalance: balN }),
        });
      }

      setCreated({
        id: loan.id,
        name: loan.name,
        monthlyPayment: Number(loan.monthlyPayment) || pay,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  const totalsProgress = useMemo(() => {
    if (!data || !(data.totals.original > 0)) return 0;
    return Math.min(
      100,
      Math.round(
        (data.totals.repaid / Math.max(data.totals.original, 1)) * 100,
      ),
    );
  }, [data]);

  return (
    <div className="stack debts-page">
      <PageHeader
        kicker="הלוואות"
        title="מה נשאר להחזיר"
        subtitle="כמה נשאר להחזיר — ומה כבר שולם"
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (openForm) {
                setOpenForm(false);
                resetForm();
              } else {
                resetForm();
                setOpenForm(true);
              }
            }}
          >
            {openForm ? "סגור" : "הוסף הלוואה"}
          </button>
        }
        footer={<DebtsSubNav />}
      />
      <PeriodBar />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {msg && <p className="badge good">{msg}</p>}

      {data && (
        <section className="debts-totals" aria-label="סה״כ הלוואות">
          <p className="debts-totals-eyebrow">סה״כ הלוואות</p>
          <div className="debts-totals-hero">
            <div>
              <span className="muted">יתרה שנותרה</span>
              <strong>{formatIls(data.totals.principal)}</strong>
            </div>
            <div className="debts-totals-side">
              <div>
                <span className="muted">מקורי</span>
                <strong>{formatIls(data.totals.original)}</strong>
              </div>
              <div>
                <span className="muted">הוחזר</span>
                <strong>{formatIls(data.totals.repaid)}</strong>
              </div>
              <div>
                <span className="muted">החזר חודשי</span>
                <strong>{formatIls(data.totals.monthlyPayment)}</strong>
              </div>
            </div>
          </div>
          {data.totals.original > 0 && (
            <DebtSplitMeter
              variant="loan"
              title="איך נראה ההחזר עד כה"
              titleAmount={data.totals.original}
              emphasis={`${totalsProgress}% הוחזר`}
              leftPct={totalsProgress}
              leftLabel="הוחזר"
              leftAmount={data.totals.repaid}
              rightLabel="נותר"
              rightAmount={data.totals.principal}
            />
          )}
        </section>
      )}

      {openForm && (
        <form className="debt-add-panel compact-form" onSubmit={onCreate}>
          {!created ? (
            <>
              <p className="debts-totals-eyebrow">הלוואה חדשה</p>
              <div className="debt-wizard-progress">
                <span className="muted">
                  שלב {step} מתוך {STEPS.length} · {STEPS[step - 1].label}
                </span>
                <div className="debt-wizard-track" aria-hidden>
                  <div
                    className="debt-wizard-track-fill"
                    style={{
                      width: `${(step / STEPS.length) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {step === 1 && (
                <>
                  <p className="muted debt-wizard-hint">
                    שם שתזהו בתנועות — למשל «מימון רכב».
                  </p>
                  <label className="field">
                    <span>שם ההלוואה</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="מימון רכב"
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span>בנק / ספק (אופציונלי)</span>
                    <input
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      placeholder="למשל: בנק הפועלים"
                    />
                  </label>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="muted debt-wizard-hint">
                    מקורי = כמה לקחתם. יתרה = כמה עוד נשאר היום.
                  </p>
                  <div className="grid grid-2">
                    <label className="field">
                      <span>סכום מקורי</span>
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={original}
                        onChange={(e) => {
                          setOriginal(e.target.value);
                          if (!principal) setPrincipal(e.target.value);
                        }}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>כמה נשאר עכשיו</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={principal}
                        onChange={(e) => setPrincipal(e.target.value)}
                        placeholder="אם חדשה — כמו המקורי"
                      />
                    </label>
                  </div>
                  {origN > 0 && (
                    <DebtSplitMeter
                      variant="loan"
                      title="תצוגה מקדימה"
                      emphasis={`${progressPreview}% הוחזר`}
                      leftPct={progressPreview}
                      leftLabel="כבר שולם"
                      leftAmount={repaidPreview}
                      rightLabel="נותר"
                      rightAmount={balN}
                    />
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <p className="muted debt-wizard-hint">
                    ההחזר שיוצא מהעו״ש. ריבית שנתית עוזרת לפצל ריבית מול קרן.
                  </p>
                  <div className="grid grid-2">
                    <label className="field">
                      <span>תשלום חודשי</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={monthly}
                        onChange={(e) => setMonthly(e.target.value)}
                        placeholder="850"
                      />
                    </label>
                    <label className="field">
                      <span>מועד התשלום הבא</span>
                      <input
                        type="date"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>ריבית שנתית % (אופציונלי)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={apr}
                      onChange={(e) => setApr(e.target.value)}
                      placeholder="למשל 5.9"
                    />
                  </label>
                  {Number(apr) > 0 && balN > 0 && (
                    <p className="muted debt-wizard-hint">
                      הערכה לחודש: כ־
                      {formatIls(
                        Math.round(((balN * Number(apr)) / 100 / 12) * 100) /
                          100,
                      )}{" "}
                      ריבית — והשאר לקרן.
                    </p>
                  )}
                </>
              )}

              {step === 4 && (
                <>
                  <p className="muted debt-wizard-hint">
                    אפשר לרשום עכשיו את ההחזר בתנועות — או אחר כך.
                  </p>
                  <label className="debt-add-check">
                    <input
                      type="checkbox"
                      checked={recordPayment}
                      onChange={(e) => setRecordPayment(e.target.checked)}
                      disabled={!(Number(monthly) > 0)}
                    />
                    <span>
                      לרשום תשלום של{" "}
                      {Number(monthly) > 0
                        ? formatIls(Number(monthly))
                        : "ההחזר החודשי"}{" "}
                      בתנועות (היתרה נשארת כמו שמילאתם)
                    </span>
                  </label>
                  {!(Number(monthly) > 0) && (
                    <p className="muted debt-wizard-hint">
                      בלי סכום חודשי — הוסיפו תשלום ממסך תנועות (סוג: תשלום
                      הלוואה).
                    </p>
                  )}
                </>
              )}

              <div className="debt-wizard-nav">
                {step > 1 && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setStep((s) => Math.max(1, s - 1))}
                  >
                    הקודם
                  </button>
                )}
                {step < 4 ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={!canNext()}
                    onClick={() => setStep((s) => Math.min(4, s + 1))}
                  >
                    המשך
                  </button>
                ) : (
                  <button className="btn" type="submit" disabled={busy}>
                    שמירת הלוואה
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="debt-post-create">
              <h2 style={{ margin: 0 }}>נשמר: {created.name}</h2>
              <p className="muted">
                {recordPayment
                  ? "נרשם גם תשלום בתנועות — היתרה והעו״ש עודכנו."
                  : "אפשר לרשום תשלומים בכל עת ממסך תנועות."}
              </p>
              <div className="debt-post-actions">
                <Link
                  className="btn"
                  href={appHref(`/app/debts/loans/${created.id}`, month)}
                >
                  לפרטי ההלוואה
                </Link>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setPayOpenId(created.id);
                    setOpenForm(false);
                    resetForm();
                  }}
                >
                  רשום תשלום
                </button>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    resetForm();
                    setOpenForm(false);
                  }}
                >
                  סיום
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {data?.overdraft && (
        <article className="debts-item debts-item--quiet">
          <div className="debts-item-head">
            <div>
              <h3>{data.overdraft.name}</h3>
              <p className="muted">נגזר מיתרת העו״ש — לא הלוואה רשומה</p>
            </div>
            <strong className="debts-item-hero-amt">
              {formatIls(data.overdraft.principalBalance)}
            </strong>
          </div>
        </article>
      )}

      {data && data.loans.length === 0 && !data.overdraft && !openForm && (
        <section className="card debts-empty-cta">
          <div>
            <strong>עדיין אין הלוואות</strong>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              הוסיפו אחת — ואז אפשר לחבר תשלומים מתנועות.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetForm();
              setOpenForm(true);
            }}
          >
            הוסף הלוואה
          </button>
        </section>
      )}

      <div className="debts-list-section">
        {data && data.loans.length > 0 && (
          <div className="debts-list-heading">
            <h2>ההלוואות שלי</h2>
            <span className="muted">
              {data.loans.length === 1
                ? "הלוואה אחת"
                : `${data.loans.length} הלוואות`}
            </span>
          </div>
        )}
        {data?.loans.map((loan) => {
          const moreOpen = moreOpenId === loan.id;
          const payOpen = payOpenId === loan.id;
          const quietHint =
            loan.monthlyPayment > 0
              ? `החזר ${formatIls(loan.monthlyPayment)}${
                  loan.nextDueDate
                    ? ` · הבא ${formatDate(loan.nextDueDate)}`
                    : ""
                }`
              : loan.nextDueDate
                ? `תשלום הבא ${formatDate(loan.nextDueDate)}`
                : null;
          return (
            <article key={loan.id} className="debts-item">
              <div className="debts-item-head">
                <div>
                  <h3>{loan.name}</h3>
                  <p className="debts-item-saved">
                    {formatIls(loan.principalBalance)}
                    <span className="muted">
                      {" "}
                      נותר · {loan.progressPct}% הוחזר
                    </span>
                  </p>
                  {loan.provider && (
                    <p className="muted debts-item-provider">{loan.provider}</p>
                  )}
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

              {quietHint && !moreOpen && !payOpen && (
                <p className="muted debts-item-hint">{quietHint}</p>
              )}

              <div className="debts-item-primary-row">
                {payOpen ? null : (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || loan.principalBalance <= 0.001}
                    onClick={() => {
                      setPayOpenId(loan.id);
                      setMoreOpenId(null);
                      setMsg(null);
                    }}
                  >
                    {loan.principalBalance <= 0.001
                      ? "הלוואה סגורה"
                      : "רשום תשלום"}
                  </button>
                )}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    setMoreOpenId(moreOpen ? null : loan.id);
                    if (!moreOpen) setPayOpenId(null);
                  }}
                >
                  {moreOpen ? "פחות" : "עוד"}
                </button>
              </div>

              {payOpen && (
                <LoanPaymentPanel
                  loanId={loan.id}
                  loanName={loan.name}
                  monthlyPayment={loan.monthlyPayment}
                  month={month}
                  loanClosed={loan.principalBalance <= 0.001}
                  onCancel={() => setPayOpenId(null)}
                  onDone={async () => {
                    setMsg(`נרשם תשלום ל«${loan.name}»`);
                    await load();
                  }}
                />
              )}

              {moreOpen && (
                <div className="debts-item-more">
                  <div className="loan-parts">
                    <div className="loan-parts-block">
                      <span className="loan-parts-label">סכומים</span>
                      <div className="debts-item-row">
                        <div className="debts-item-primary">
                          <span className="muted">יתרה</span>
                          <strong>
                            {formatIls(loan.principalBalance)}
                          </strong>
                        </div>
                        <div>
                          <span className="muted">מקורי</span>
                          <strong>
                            {formatIls(loan.originalAmount)}
                          </strong>
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
                          <strong>
                            {formatIls(loan.monthlyPayment)}
                          </strong>
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
                            {loan.aprPercent != null
                              ? `${loan.aprPercent}%`
                              : "—"}
                          </strong>
                        </div>
                      </div>
                      {loan.aprPercent == null && loan.monthlyPayment > 0 && (
                        <p className="muted loan-parts-hint">
                          בלי ריבית שנתית אי אפשר לפצל ריבית מול קרן — השלימו
                          בפרטים.
                        </p>
                      )}
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
                          <strong>
                            {loan.remainingPayments != null
                              ? loan.remainingPayments
                              : "—"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Link
                    className="debts-item-link"
                    href={appHref(`/app/debts/loans/${loan.id}`, month)}
                  >
                    לפרטי ההלוואה
                  </Link>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function LoansPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <LoansInner />
    </Suspense>
  );
}
