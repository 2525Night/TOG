"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatIls } from "@/lib/api";
import { PeriodBar, useSelectedMonth, appHref } from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { DebtsSubNav } from "@/components/DebtsSubNav";
import { DebtSplitMeter } from "@/components/DebtSplitMeter";

type Card = {
  id: string;
  name: string;
  provider: string | null;
  lastFour: string | null;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  utilizationPct: number;
  cycleSpend: number;
  upcomingCharge: number;
  nextBillingDate: string | null;
  installmentCommitment: number;
};

type ListResponse = {
  month: string;
  items: Card[];
  totals: {
    cycleSpend: number;
    upcomingCharges: number;
    availableCredit: number;
    utilizationPct: number;
    activeCount: number;
    installmentCommitment: number;
    currentBalance?: number;
    creditLimit?: number;
  };
};

type CreatedCard = { id: string; name: string; lastFour: string | null };

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
  { id: 1, label: "זיהוי כרטיס" },
  { id: 2, label: "מסגרת ומחזור" },
  { id: 3, label: "חיוב" },
  { id: 4, label: "תנועות" },
] as const;

function CardsInner() {
  const month = useSelectedMonth();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [limit, setLimit] = useState("");
  const [balance, setBalance] = useState("");
  const [billing, setBilling] = useState("");
  const [seedPurchase, setSeedPurchase] = useState(false);
  const [created, setCreated] = useState<CreatedCard | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);

  async function load() {
    const res = await api<ListResponse>(
      `/credit-cards?month=${encodeURIComponent(month)}`,
    );
    setData(res);
  }

  useEffect(() => {
    setMoreOpenId(null);
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה"),
    );
  }, [month]);

  const limitN = Number(limit) || 0;
  const balN = Number(balance) || 0;
  const availablePreview = Math.max(0, limitN - balN);
  const utilPreview =
    limitN > 0 ? Math.min(100, Math.round((balN / limitN) * 100)) : 0;

  function resetForm() {
    setStep(1);
    setName("");
    setProvider("");
    setLastFour("");
    setLimit("");
    setBalance("");
    setBilling("");
    setSeedPurchase(false);
    setCreated(null);
  }

  function canNext() {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return true;
    return true;
  }

  async function chargeDueForMonth() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        chargedCount: number;
        chargedTotal: number;
      }>(
        `/credit-cards/installments/charge-due?month=${encodeURIComponent(month)}`,
        { method: "POST" },
      );
      await load();
      if (res.chargedCount === 0) {
        setMsg("אין תשלומי אשראי לרישום לחודש זה");
      } else {
        setMsg(
          `נרשמו ${res.chargedCount} תשלומי אשראי · ${formatIls(res.chargedTotal)}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const card = await api<CreatedCard>(
        "/credit-cards",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            provider: provider.trim() || undefined,
            lastFour: lastFour.trim() || undefined,
            creditLimit: limit.trim() === "" ? undefined : Math.abs(limitN),
            currentBalance: balance.trim() === "" ? 0 : Math.abs(balN),
            nextBillingDate: billing || undefined,
          }),
        },
      );

      // Optional: seed one CARD_PURCHASE so cycle spend appears in MonthFacts /
      // Transactions without double-counting (settlement stays separate).
      if (seedPurchase && balN > 0 && card?.id) {
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify({
            direction: "EXPENSE",
            amount: balN,
            categoryKey: "other",
            description: `יתרת מחזור פתיחה · ${card.name}${
              card.lastFour ? ` ·••• ${card.lastFour}` : ""
            }`,
            bookedAt: `${defaultBookedAt(month)}T12:00:00.000Z`,
            economicRole: "CARD_PURCHASE",
            creditCardId: card.id,
          }),
        });
        // CARD_PURCHASE increments balance — we already set currentBalance.
        // Revert the double-count on card balance.
        await api(`/credit-cards/${card.id}`, {
          method: "PATCH",
          body: JSON.stringify({ currentBalance: balN }),
        });
      }

      setCreated({
        id: card.id,
        name: card.name,
        lastFour: card.lastFour || lastFour.trim() || null,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack debts-page">
      <PageHeader
        kicker="כרטיסי אשראי"
        title="אשראי פתוח"
        subtitle="מה חייבים בכרטיס — ומה כבר נרשם בתנועות"
        actions={
          <div className="debts-tx-row-actions">
            {data && data.totals.installmentCommitment > 0 && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void chargeDueForMonth()}
              >
                רשום תשלומי אשראי לחודש
              </button>
            )}
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
              {openForm ? "סגור" : "הוסף כרטיס"}
            </button>
          </div>
        }
        footer={<DebtsSubNav />}
      />
      <PeriodBar />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {msg && !error && (
        <p className="badge good" role="status">
          {msg}
        </p>
      )}

      {data && (
        <section
          className="debts-totals debts-totals--credit"
          aria-label="סה״כ כרטיסים"
        >
          <p className="debts-totals-eyebrow">סה״כ כרטיסים</p>
          <div className="debts-totals-hero">
            <div>
              <span className="muted">חיוב קרוב</span>
              <strong>{formatIls(data.totals.upcomingCharges)}</strong>
            </div>
            <div className="debts-totals-side">
              <div>
                <span className="muted">מחזור</span>
                <strong>{formatIls(data.totals.cycleSpend)}</strong>
              </div>
              <div>
                <span className="muted">זמין</span>
                <strong>{formatIls(data.totals.availableCredit)}</strong>
              </div>
              {data.totals.installmentCommitment > 0 && (
                <div>
                  <span className="muted">תשלומים</span>
                  <strong>
                    {formatIls(data.totals.installmentCommitment)}
                  </strong>
                </div>
              )}
            </div>
          </div>
          {(data.totals.creditLimit ?? 0) > 0 ||
          data.totals.availableCredit + data.totals.upcomingCharges > 0 ? (
            <DebtSplitMeter
              variant="credit"
              title="מסגרת כוללת"
              titleAmount={data.totals.creditLimit || 0}
              emphasis={`${data.totals.utilizationPct}% בשימוש`}
              leftPct={data.totals.utilizationPct}
              leftLabel="בשימוש"
              leftAmount={
                data.totals.currentBalance ??
                Math.max(
                  0,
                  (data.totals.creditLimit || 0) - data.totals.availableCredit,
                )
              }
              rightLabel="זמין"
              rightAmount={data.totals.availableCredit}
            />
          ) : null}
        </section>
      )}

      {openForm && (
        <form
          className="debt-add-panel debt-add-panel--credit compact-form"
          onSubmit={onCreate}
        >
          {!created ? (
            <>
              <p className="debts-totals-eyebrow">כרטיס חדש</p>
              <div className="debt-wizard-progress">
                <span className="muted">
                  שלב {step} מתוך {STEPS.length} · {STEPS[step - 1].label}
                </span>
                <div className="debt-wizard-track" aria-hidden>
                  <div
                    className="debt-wizard-track-fill debt-wizard-track-fill--credit"
                    style={{
                      width: `${(step / STEPS.length) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {step === 1 && (
                <>
                  <p className="muted debt-wizard-hint">
                    כך תזהו בתנועות — «כאל ·••• 4821».
                  </p>
                  <label className="field">
                    <span>שם לכרטיס</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="כאל / ויזה"
                      autoFocus
                    />
                  </label>
                  <div className="grid grid-2">
                    <label className="field">
                      <span>4 ספרות אחרונות</span>
                      <input
                        value={lastFour}
                        onChange={(e) =>
                          setLastFour(
                            e.target.value.replace(/\D/g, "").slice(0, 4),
                          )
                        }
                        maxLength={4}
                        inputMode="numeric"
                        placeholder="4821"
                      />
                    </label>
                    <label className="field">
                      <span>חברת אשראי</span>
                      <input
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        placeholder="כאל / ישראכרט / MAX"
                      />
                    </label>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="muted debt-wizard-hint">
                    מסגרת אופציונלית. יתרת מחזור = כמה כבר נצבר לחיוב הקרוב.
                  </p>
                  <div className="grid grid-2">
                    <label className="field">
                      <span>מסגרת אשראי</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={limit}
                        onChange={(e) => setLimit(e.target.value)}
                        placeholder="למשל 15000"
                      />
                    </label>
                    <label className="field">
                      <span>כמה כבר במחזור</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        placeholder="0 אם מחזור ריק"
                      />
                    </label>
                  </div>
                  {limitN > 0 && (
                    <DebtSplitMeter
                      variant="credit"
                      title="תצוגה מקדימה"
                      titleAmount={limitN}
                      emphasis={`${utilPreview}% ניצול`}
                      leftPct={utilPreview}
                      leftLabel="במחזור"
                      leftAmount={balN}
                      rightLabel="זמין"
                      rightAmount={availablePreview}
                    />
                  )}
                </>
              )}

              {step === 3 && (
                <>
                  <p className="muted debt-wizard-hint">
                    מתי הסכום יורד מהעו״ש כסילוק — לא כהוצאה כפולה.
                  </p>
                  <label className="field">
                    <span>מועד חיוב הבא</span>
                    <input
                      type="date"
                      value={billing}
                      onChange={(e) => setBilling(e.target.value)}
                    />
                  </label>
                </>
              )}

              {step === 4 && (
                <>
                  <p className="muted debt-wizard-hint">
                    קנייה נספרת כהוצאה. סילוק מהעו״ש — בלי להנפח הוצאות.
                  </p>
                  {balN > 0 && (
                    <label className="debt-add-check">
                      <input
                        type="checkbox"
                        checked={seedPurchase}
                        onChange={(e) => setSeedPurchase(e.target.checked)}
                      />
                      <span>
                        לרשום את יתרת המחזור ({formatIls(balN)}) גם כתנועת
                        קנייה אחת
                      </span>
                    </label>
                  )}
                  {!(balN > 0) && (
                    <p className="muted debt-wizard-hint">
                      מחזור ריק — כשתוסיפו קנייה, בחרו «קנייה בכרטיס».
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
                    שמירת כרטיס
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="debt-post-create">
              <h2 style={{ margin: 0 }}>
                נשמר: {created.name}
                {created.lastFour ? ` ·••• ${created.lastFour}` : ""}
              </h2>
              <p className="muted">
                {seedPurchase
                  ? "נרשמה גם תנועת קנייה למחזור — בלי סילוק כפול."
                  : "קניות וסילוקים — ממסך תנועות או מפרטי הכרטיס."}
              </p>
              <div className="debt-post-actions">
                <Link
                  className="btn"
                  href={appHref(`/app/debts/cards/${created.id}`, month)}
                >
                  לפרטי הכרטיס
                </Link>
                <Link
                  className="btn secondary"
                  href={`${appHref("/app/money", month)}&creditCardId=${created.id}`}
                >
                  לתנועות
                </Link>
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

      {data && data.items.length === 0 && !openForm && (
        <section className="card debts-empty-cta">
          <div>
            <strong>עדיין אין כרטיסים</strong>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              אחרי הוספה — קניות וסילוק מסתנכרנים עם תנועות.
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
            הוסף כרטיס
          </button>
        </section>
      )}

      <div className="debts-list-section">
        {data && data.items.length > 0 && (
          <div className="debts-list-heading">
            <h2>הכרטיסים שלי</h2>
            <span className="muted">
              {data.items.length === 1
                ? "כרטיס אחד"
                : `${data.items.length} כרטיסים`}
            </span>
          </div>
        )}
        {data?.items.map((card) => {
          const moreOpen = moreOpenId === card.id;
          const quietHint = card.nextBillingDate
            ? `חיוב ב־${formatDate(card.nextBillingDate)}${
                card.installmentCommitment > 0
                  ? ` · תשלומים ${formatIls(card.installmentCommitment)}`
                  : ""
              }`
            : card.installmentCommitment > 0
              ? `תשלומים שנותרו ${formatIls(card.installmentCommitment)}`
              : null;
          return (
            <article key={card.id} className="debts-item">
              <div className="debts-item-head">
                <div>
                  <h3>
                    {card.name}
                    {card.lastFour ? ` ·••• ${card.lastFour}` : ""}
                  </h3>
                  <p className="debts-item-saved">
                    {formatIls(card.upcomingCharge)}
                    <span className="muted"> חיוב קרוב</span>
                  </p>
                  {card.provider && (
                    <p className="muted debts-item-provider">{card.provider}</p>
                  )}
                </div>
              </div>

              {card.creditLimit > 0 && (
                <DebtSplitMeter
                  variant="credit"
                  title="מסגרת"
                  titleAmount={card.creditLimit}
                  emphasis={`${card.utilizationPct}% ניצול`}
                  leftPct={card.utilizationPct}
                  leftLabel="בשימוש"
                  leftAmount={card.currentBalance}
                  rightLabel="זמין"
                  rightAmount={card.availableCredit}
                />
              )}

              {quietHint && !moreOpen && (
                <p className="muted debts-item-hint">{quietHint}</p>
              )}

              <div className="debts-item-primary-row">
                <Link
                  className="btn"
                  href={`${appHref(`/app/debts/cards/${card.id}`, month)}&charge=1`}
                >
                  הוסף חיוב
                </Link>
                <button
                  type="button"
                  className="linkish"
                  onClick={() =>
                    setMoreOpenId(moreOpen ? null : card.id)
                  }
                >
                  {moreOpen ? "פחות" : "עוד"}
                </button>
              </div>

              {moreOpen && (
                <div className="debts-item-more">
                  <div className="debts-item-row">
                    <div className="debts-item-primary">
                      <span className="muted">חיוב קרוב</span>
                      <strong>{formatIls(card.upcomingCharge)}</strong>
                    </div>
                    <div>
                      <span className="muted">מחזור</span>
                      <strong>{formatIls(card.cycleSpend)}</strong>
                    </div>
                    <div>
                      <span className="muted">זמין</span>
                      <strong>{formatIls(card.availableCredit)}</strong>
                    </div>
                    <div>
                      <span className="muted">חיוב הבא</span>
                      <strong>{formatDate(card.nextBillingDate)}</strong>
                    </div>
                  </div>
                  {card.installmentCommitment > 0 && (
                    <p className="muted debts-item-hint">
                      תשלומים שנותרו: {formatIls(card.installmentCommitment)}
                    </p>
                  )}
                  <Link
                    className="debts-item-link"
                    href={appHref(`/app/debts/cards/${card.id}`, month)}
                  >
                    לפרטי הכרטיס
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

export default function CardsPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <CardsInner />
    </Suspense>
  );
}
