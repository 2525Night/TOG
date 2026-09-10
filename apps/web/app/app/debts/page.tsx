"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatIls } from "@/lib/api";
import { PeriodBar, useSelectedMonth, appHref } from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { DebtsSubNav } from "@/components/DebtsSubNav";
import { DebtSplitMeter } from "@/components/DebtSplitMeter";
import { FeelRow } from "@/components/FeelRow";

type Overview = {
  month: string;
  loans: {
    principal: number;
    original?: number;
    repaid?: number;
    monthlyPayment: number;
    activeCount: number;
    nextPaymentAmount: number | null;
    nextPaymentDate: string | null;
    overdraft: number | null;
  };
  creditCards: {
    cycleSpend: number;
    upcomingCharges: number;
    availableCredit: number;
    creditLimit: number;
    utilizationPct: number;
    activeCount: number;
    installmentCommitment: number;
  };
  upcomingObligations: {
    loansThisMonth: number;
    creditCardCharges: number;
    total: number;
  };
  attention: Array<{ kind: string; titleHe: string; bodyHe: string }>;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL");
}

function OverviewInner() {
  const month = useSelectedMonth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loansMore, setLoansMore] = useState(false);
  const [cardsMore, setCardsMore] = useState(false);

  useEffect(() => {
    setLoansMore(false);
    setCardsMore(false);
    api<Overview>(`/debts/overview?month=${encodeURIComponent(month)}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"));
  }, [month]);

  const oblTotal = data?.upcomingObligations.total ?? 0;
  const loanOriginal = data?.loans.original ?? 0;
  const loanRepaid = data?.loans.repaid ?? 0;
  const loanProgress =
    loanOriginal > 0
      ? Math.min(100, Math.round((loanRepaid / loanOriginal) * 100))
      : 0;
  const showLoanProgress =
    (data?.loans.principal ?? 0) > 0 && loanProgress > 0 && loanProgress < 100;
  const openCredit = data
    ? Math.max(
        0,
        (data.creditCards.creditLimit || 0) -
          (data.creditCards.availableCredit || 0),
      )
    : 0;
  const openTotal = (data?.loans.principal ?? 0) + openCredit;
  const coveredNear =
    oblTotal <= 0 ||
    (data?.attention.length ?? 0) === 0 ||
    !(data?.attention || []).some((a) =>
      /לחץ|חסר|מינוס|דחוק|סיכון/i.test(`${a.titleHe} ${a.bodyHe}`),
    );

  return (
    <div className="stack debts-page">
      <PageHeader
        kicker="אשראי והלוואות · בכבוד"
        title="יש סכום פתוח — ויש אדם שמנהל אותו"
        subtitle="שפה רגועה: אשראי והלוואות — לא תווית מפחידה. רואים את המספר, ואז כמה כבר התקדמתם."
        footer={<DebtsSubNav />}
      />
      <PeriodBar />

      {error && (
        <p className="form-error" role="alert">
          {error}
          {/fetch|network|Failed|ECONNREFUSED|timeout/i.test(error)
            ? " · בדקו שה־API רץ על פורט 3001"
            : ""}
        </p>
      )}
      {!data && !error && <p className="mt-state mt-state-loading">טוען…</p>}

      {data && (
        <>
          <section className="debts-hero-grid rise-2" aria-label="תמונת אשראי">
            <div className="clarity-answer debts-hero-answer">
              <span className="clarity-answer-label">סה״כ פתוח</span>
              <div className="clarity-answer-value">{formatIls(openTotal)}</div>
              <p className="debts-hero-human">
                {openTotal > 0
                  ? "המספר גדול — והוא לא כל הסיפור. יש תוכנית תשלומים, יש כיסוי לחודש הקרוב, ויש התקדמות מדידה."
                  : "אין סכום פתוח כרגע — אפשר להוסיף הלוואה או כרטיס כשצריך."}
              </p>
              <div
                className="clarity-meaning mt-chips"
                style={{ display: "flex", paddingTop: "0.35rem" }}
              >
                <span className="mt-chip">
                  הלוואות <b>{formatIls(data.loans.principal)}</b>
                </span>
                <span className="mt-chip">
                  אשראי שוטף <b>{formatIls(openCredit)}</b>
                </span>
                {oblTotal > 0 && (
                  <span className="mt-chip warn">
                    קרוב החודש <b>{formatIls(oblTotal)}</b>
                  </span>
                )}
              </div>
              {showLoanProgress && (
                <div
                  className="mt-meter"
                  style={{ marginTop: "0.85rem" }}
                  aria-label={`התקדמות ${loanProgress}%`}
                >
                  <i style={{ width: `${loanProgress}%` }} />
                </div>
              )}
            </div>

            <article className="mt-surface debts-calm-card">
              <div className="mt-kicker">למה אפשר להישאר רגועים</div>
              <div className="debts-calm-rows">
                <div className="debts-calm-row">
                  <span>תשלומים קרובים</span>
                  <strong className={coveredNear ? "tx-in" : undefined}>
                    {oblTotal > 0
                      ? coveredNear
                        ? "מכוסים"
                        : formatIls(oblTotal)
                      : "אין קרוב"}
                  </strong>
                </div>
                <div className="debts-calm-row">
                  <span>סילוק אשראי קרוב</span>
                  <strong>
                    {data.creditCards.upcomingCharges > 0
                      ? formatIls(data.creditCards.upcomingCharges)
                      : "—"}
                  </strong>
                </div>
                <div className="debts-calm-row">
                  <span>לחץ תזרימי</span>
                  <span className={`badge ${coveredNear ? "good" : "warn"}`}>
                    {coveredNear ? "בשליטה" : "לשים לב"}
                  </span>
                </div>
              </div>
              <p className="muted debts-calm-note">
                כשהמידע מסודר ככה — המוח מפסיק להיכנס לפאניקה ומתחיל לתכנן.
              </p>
            </article>
          </section>

          <FeelRow
            items={[
              {
                emo: "להבין",
                title: "פתוח ≠ קריסה",
                text: "סכום פתוח מתאר התחייבויות לאורך זמן. מה שקובע היום הוא הכיסוי הקרוב.",
              },
              {
                emo: "להרגיש",
                title: "גאווה על ניהול",
                text: "לראות הלוואות ואשראי בנפרד זה כבר שליטה — לא בלגן אחד.",
              },
              {
                emo: "לעשות",
                title: "לא להאיץ מתוך פחד",
                text: "אל תפרעו הכול עכשיו אם זה שובר את החיץ. קצב יציב מנצח.",
                hold: true,
              },
            ]}
          />

          {data.attention.length > 0 && (
            <section className="debts-attention">
              {data.attention.map((a) => (
                <div key={a.kind} className="debts-attention-item">
                  <strong>{a.titleHe}</strong>
                  <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                    {a.bodyHe}
                  </p>
                </div>
              ))}
            </section>
          )}

          {data.loans.activeCount === 0 &&
            data.creditCards.activeCount === 0 &&
            !data.loans.overdraft && (
              <section className="card debts-empty-cta mt-state-empty">
                <div>
                  <strong>עדיין אין הלוואות או כרטיסים</strong>
                  <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                    בחרו איפה להתחיל.
                  </p>
                </div>
                <div className="debt-post-actions">
                  <Link className="btn" href={appHref("/app/debts/loans", month)}>
                    הוסף הלוואה
                  </Link>
                  <Link
                    className="btn secondary"
                    href={appHref("/app/debts/cards", month)}
                  >
                    הוסף כרטיס
                  </Link>
                </div>
              </section>
            )}

          <section className="mt-surface debts-domain-block rise-3" id="loans">
            <div className="debts-domain-head">
              <h2>הלוואות</h2>
              <Link
                className="btn secondary"
                href={appHref("/app/debts/loans", month)}
              >
                {data.loans.activeCount === 0 ? "הוסף הלוואה" : "להלוואות"}
              </Link>
            </div>
            <article className="debts-item debts-item--nested">
              <div className="debts-item-head">
                <div>
                  <h3>
                    {data.loans.principal <= 0 && loanProgress >= 100
                      ? "הלוואה סולקה"
                      : data.loans.activeCount === 0
                        ? "עדיין אין הלוואות"
                        : data.loans.activeCount === 1
                          ? "הלוואה פעילה"
                          : `${data.loans.activeCount} הלוואות`}
                  </h3>
                  <p className="debts-item-saved">
                    {formatIls(data.loans.principal)}
                    <span className="muted"> יתרה נותרת</span>
                  </p>
                </div>
                {loanProgress >= 100 && data.loans.principal <= 0 ? (
                  <span className="badge good debts-count-badge">הושלם</span>
                ) : loanProgress > 0 && data.loans.principal > 0 ? (
                  <span className="badge good debts-count-badge">
                    {loanProgress}% מאחוריכם
                  </span>
                ) : null}
              </div>

              {loanOriginal > 0 && (
                <DebtSplitMeter
                  variant="loan"
                  title="סכום ההלוואות"
                  titleAmount={loanOriginal}
                  emphasis={`${loanProgress}% הוחזר`}
                  leftPct={loanProgress}
                  leftLabel="הוחזר"
                  leftAmount={loanRepaid}
                  rightLabel="נותר"
                  rightAmount={data.loans.principal}
                />
              )}

              {!loansMore && data.loans.activeCount > 0 && (
                <p className="muted debts-item-hint">
                  החזר {formatIls(data.loans.monthlyPayment)}
                  {data.loans.nextPaymentDate
                    ? ` · הבא ${formatDate(data.loans.nextPaymentDate)}`
                    : ""}
                </p>
              )}

              <div className="debts-item-primary-row">
                <Link
                  className="btn"
                  href={appHref("/app/debts/loans", month)}
                >
                  {data.loans.activeCount === 0
                    ? "הוסף הלוואה"
                    : "רשום תשלום / פרטים"}
                </Link>
                {data.loans.activeCount > 0 && (
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setLoansMore((v) => !v)}
                  >
                    {loansMore ? "פחות" : "עוד"}
                  </button>
                )}
              </div>

              {loansMore && (
                <div className="debts-item-more">
                  <div className="debts-item-row">
                    <div>
                      <span className="muted">החזר חודשי</span>
                      <strong>
                        {formatIls(data.loans.monthlyPayment)}
                      </strong>
                    </div>
                    <div>
                      <span className="muted">פעילות</span>
                      <strong>{data.loans.activeCount}</strong>
                    </div>
                    {(data.loans.nextPaymentAmount != null ||
                      data.loans.nextPaymentDate) && (
                      <div className="debts-item-primary">
                        <span className="muted">תשלום הבא</span>
                        <strong>
                          {data.loans.nextPaymentAmount != null
                            ? formatIls(data.loans.nextPaymentAmount)
                            : "—"}
                        </strong>
                        {data.loans.nextPaymentDate && (
                          <span className="muted debts-kpi-hint">
                            {formatDate(data.loans.nextPaymentDate)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {data.loans.overdraft != null && data.loans.overdraft > 0 && (
                    <p className="muted debts-item-hint">
                      מינוס בעו״ש: {formatIls(data.loans.overdraft)}
                    </p>
                  )}
                </div>
              )}
            </article>
          </section>

          <section className="mt-surface debts-domain-block rise-3" id="cards">
            <div className="debts-domain-head">
              <h2>כרטיסי אשראי</h2>
              <Link
                className="btn secondary"
                href={appHref("/app/debts/cards", month)}
              >
                {data.creditCards.activeCount === 0
                  ? "הוסף כרטיס"
                  : "לכרטיסים"}
              </Link>
            </div>
            <article className="debts-item debts-item--nested">
              <div className="debts-item-head">
                <div>
                  <h3>
                    {data.creditCards.activeCount === 0
                      ? "עדיין אין כרטיסים"
                      : data.creditCards.activeCount === 1
                        ? "כרטיס פעיל"
                        : `${data.creditCards.activeCount} כרטיסים`}
                  </h3>
                  <p className="debts-item-saved">
                    {formatIls(data.creditCards.upcomingCharges)}
                    <span className="muted"> חיוב קרוב</span>
                  </p>
                </div>
                {data.creditCards.utilizationPct > 0 && (
                  <span
                    className={`badge debts-count-badge ${
                      data.creditCards.utilizationPct >= 70 ? "warn" : "good"
                    }`}
                  >
                    {data.creditCards.utilizationPct}% · בניהול
                  </span>
                )}
              </div>

              {(data.creditCards.availableCredit > 0 ||
                data.creditCards.upcomingCharges > 0 ||
                data.creditCards.utilizationPct > 0) && (
                <DebtSplitMeter
                  variant="credit"
                  title="מסגרת"
                  titleAmount={data.creditCards.creditLimit}
                  emphasis={`${data.creditCards.utilizationPct}% בשימוש`}
                  leftPct={data.creditCards.utilizationPct}
                  leftLabel="בשימוש"
                  leftAmount={Math.max(
                    0,
                    data.creditCards.creditLimit -
                      data.creditCards.availableCredit,
                  )}
                  rightLabel="זמין"
                  rightAmount={data.creditCards.availableCredit}
                />
              )}

              {!cardsMore && data.creditCards.activeCount > 0 && (
                <p className="muted debts-item-hint">
                  מחזור {formatIls(data.creditCards.cycleSpend)}
                  {data.creditCards.availableCredit > 0
                    ? ` · זמין ${formatIls(data.creditCards.availableCredit)}`
                    : ""}
                </p>
              )}

              <div className="debts-item-primary-row">
                <Link
                  className="btn"
                  href={appHref("/app/debts/cards", month)}
                >
                  {data.creditCards.activeCount === 0
                    ? "הוסף כרטיס"
                    : "לכרטיסים"}
                </Link>
                {data.creditCards.activeCount > 0 && (
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setCardsMore((v) => !v)}
                  >
                    {cardsMore ? "פחות" : "עוד"}
                  </button>
                )}
              </div>

              {cardsMore && (
                <div className="debts-item-more">
                  <div className="debts-item-row">
                    <div>
                      <span className="muted">הוצאות במחזור</span>
                      <strong>
                        {formatIls(data.creditCards.cycleSpend)}
                      </strong>
                    </div>
                    <div>
                      <span className="muted">כרטיסים</span>
                      <strong>{data.creditCards.activeCount}</strong>
                    </div>
                    <div>
                      <span className="muted">אשראי זמין</span>
                      <strong>
                        {formatIls(data.creditCards.availableCredit)}
                      </strong>
                    </div>
                    {data.creditCards.installmentCommitment > 0 && (
                      <div>
                        <span className="muted">תשלומים</span>
                        <strong>
                          {formatIls(data.creditCards.installmentCommitment)}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

export default function DebtsOverviewPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <OverviewInner />
    </Suspense>
  );
}
