"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatIls } from "@/lib/api";
import { CategoryBars, BudgetPie } from "@/components/Charts";
import { PeriodBar, useSelectedMonth, labelMonthHe } from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { Pulse } from "@/components/Pulse";
import { FeelRow } from "@/components/FeelRow";
import { WinStrip } from "@/components/WinStrip";

type BudgetSnapshot = {
  month: string;
  incomeActual: number;
  fixed: {
    expectedTotal: number;
    actualTotal: number;
    basisForLeftover?: "expected" | "actual";
  };
  flexible: {
    actualTotal: number;
    cap: number | null;
    remainingToCap: number | null;
  };
  afterFixed: number;
  leftover: number;
  allocatedToGoals?: number;
};

type Suggestion = {
  titleHe: string;
  categoryKey: string;
  merchantNorm: string;
  expectedAmount: number;
  monthsSeen: number;
};

type Summary = {
  period?: {
    labelHe: string;
    isCurrentMonth: boolean;
  };
  completeness: number;
  healthScore: number;
  availableBalance: number;
  liquidity?: {
    checkingBalanceNow: number;
    reservedForObligations: number;
    availableInPractice: number;
  };
  incomeMtd: number;
  expenseMtd: number;
  allocatedToGoalsMtd?: number;
  netMtd: number;
  formulaVersion?: string;
    monthFacts?: {
    checkingBalanceNow: number;
    flows: {
      income: number;
      expense: number;
      allocatedToGoals: number;
      net: number;
    };
    budget: {
      leftover: number;
      fixed: BudgetSnapshot["fixed"];
      flexible: BudgetSnapshot["flexible"];
    };
    liquidity?: {
      checkingBalanceNow: number;
      reservedForObligations: number;
      availableInPractice: number;
    };
    meta?: {
      hasCheckingAccount?: boolean;
      txCount?: number;
    };
  };
  overdraftRisk: {
    level: string;
    messageHe: string;
    alreadyNegative?: boolean;
  };
  dataGaps?: Array<{
    id: string;
    titleHe: string;
    bodyHe: string;
    ctaHe: string;
    href: string;
  }>;
  cashFlowForecast?: {
    nextMonthLabelHe: string;
    expectedIncome: number;
    expectedFixedExpenses: number;
    expectedFlexibleBuffer: number;
    projectedNet: number;
    items: Array<{ titleHe: string; amount: number; source: string }>;
  };
  recommendations: Array<{
    id: string;
    titleHe: string;
    bodyHe: string;
    priority: string;
    annualImpactIls?: number;
  }>;
  attention?: Array<{
    id: string;
    type: string;
    conclusionHe?: string;
    meaningHe?: string;
    titleHe: string;
    bodyHe: string;
    moneyLineHe?: string;
    ctaHe: string;
    href: string;
    severity: string;
    alertId?: string;
  }>;
  patterns: Array<{
    id: string;
    titleHe: string;
    bodyHe: string;
    severity: string;
  }>;
  alerts: Array<{
    id: string;
    titleHe: string;
    bodyHe: string;
    severity: string;
  }>;
  goals: Array<{
    id: string;
    title: string;
    progressPct: number;
    targetAmount: number;
    currentAmount: number;
  }>;
  debtsSummary?: {
    principalTotal: number;
    count: number;
  };
  emergencyCushion?: {
    id: string;
    title: string;
    targetAmount: number;
    currentAmount: number;
    progressPct: number;
    full?: boolean;
    remaining?: number;
  } | null;
  reservePrompt?: boolean;
  goalCards?: Array<{
    id: string;
    title: string;
    forecast?: {
      etaMonth: string | null;
      monthlyPace: number;
      paceSource: string;
    };
  }>;
  categoryBreakdown: Array<{
    key: string;
    labelHe: string;
    amount: number;
    sharePct: number;
  }>;
  budget?: BudgetSnapshot;
  budgetSuggestions?: Suggestion[];
  narrativeHe: string;
  freshness: { noteHe: string };
};

function DashboardInner() {
  const month = useSelectedMonth();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySuggest, setBusySuggest] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [surplusGoalId, setSurplusGoalId] = useState("");
  const [surplusAmount, setSurplusAmount] = useState("");
  const [busySurplus, setBusySurplus] = useState(false);
  const [surplusConfirm, setSurplusConfirm] = useState(false);
  const [goalExtras, setGoalExtras] = useState<
    Record<string, { etaMonth: string | null; pace: string | null }>
  >({});

  async function load() {
    const s = await api<Summary>(`/dashboard/summary?month=${month}`);
    setData(s);
    try {
      const enriched = await api<
        Array<{
          id: string;
          forecast?: {
            etaMonth: string | null;
            monthlyPace: number;
            paceSource: string;
          };
        }>
      >(`/goals?month=${month}`);
      const map: Record<string, { etaMonth: string | null; pace: string | null }> =
        {};
      for (const g of enriched) {
        const f = g.forecast;
        map[g.id] = {
          etaMonth: f?.etaMonth || null,
          pace:
            f && f.monthlyPace > 0
              ? `${formatIls(f.monthlyPace)}/חודש`
              : null,
        };
      }
      setGoalExtras(map);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "שגיאה"));
    const onFocus = () => {
      load().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [month]);

  async function snooze(id: string) {
    await api(`/alerts/${id}/snooze`, { method: "POST", body: "{}" });
    await load();
  }

  async function confirmSuggestion(s: Suggestion) {
    setBusySuggest(s.merchantNorm);
    try {
      await api("/budget/commitments/from-suggestion", {
        method: "POST",
        body: JSON.stringify({
          titleHe: s.titleHe,
          categoryKey: s.categoryKey,
          merchantNorm: s.merchantNorm,
          expectedAmount: s.expectedAmount,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusySuggest(null);
    }
  }

  async function applySurplus() {
    const goalId = surplusGoalId || data?.goals[0]?.id;
    const leftover = data?.budget?.leftover ?? 0;
    const amt = Number(
      surplusAmount || (leftover > 0 ? Math.round(Math.min(leftover, 500)) : 0),
    );
    if (!goalId || !(amt > 0)) return;
    if (!surplusConfirm) {
      setSurplusConfirm(true);
      return;
    }
    setBusySurplus(true);
    setError(null);
    try {
      await api(`/goals/${goalId}/apply-surplus`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, confirm: true, month }),
      });
      setSurplusAmount("");
      setSurplusConfirm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusySurplus(false);
    }
  }

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!data) {
    return <p className="mt-state mt-state-loading">טוען את המצב שלך…</p>;
  }

  const riskClass =
    data.overdraftRisk.level === "high"
      ? "bad"
      : data.overdraftRisk.level === "medium"
        ? "warn"
        : "good";

  const b = data.budget;
  const facts = data.monthFacts;
  const incomeForBar = facts?.flows.income ?? data.incomeMtd;
  const expenseForBar = facts?.flows.expense ?? data.expenseMtd;
  const plannedFixed =
    facts?.budget.fixed.expectedTotal ?? b?.fixed.expectedTotal ?? 0;
  const usingExpectedFixed =
    (facts?.budget.fixed.basisForLeftover ?? b?.fixed.basisForLeftover) ===
      "expected" ||
    (Math.abs(expenseForBar) < 0.005 && plannedFixed > 0.005);
  const sparseSetup =
    Math.abs(expenseForBar) < 0.005 && usingExpectedFixed;
  const toGoalsBar =
    facts?.flows.allocatedToGoals ??
    data.allocatedToGoalsMtd ??
    b?.allocatedToGoals ??
    0;
  const leftoverBar = facts?.budget.leftover ?? b?.leftover;
  const checkingBalance =
    data.liquidity?.checkingBalanceNow ??
    facts?.liquidity?.checkingBalanceNow ??
    facts?.checkingBalanceNow ??
    data.availableBalance;
  const availableNow =
    data.liquidity?.availableInPractice ??
    facts?.liquidity?.availableInPractice ??
    data.availableBalance;

  return (
    <div className="grid" style={{ gap: "0.85rem" }}>
      <PageHeader
        kicker="תמונת מצב"
        title="המצב שלך — בקצרה"
        subtitle={
          sparseSetup ? (
            <div>
              התחלנו מהמספרים שהזנתם — עכשיו נדייק יחד עם תנועות אמיתיות.
            </div>
          ) : data.narrativeHe ? (
            <div>{data.narrativeHe}</div>
          ) : (
            <div>מבט רגוע על החודש</div>
          )
        }
      />

      <PeriodBar
        income={incomeForBar}
        expense={expenseForBar}
        plannedExpense={plannedFixed}
        extra={
          leftoverBar != null && !sparseSetup ? (
            <span>
              נותר החודש{" "}
              <strong className={leftoverBar >= 0 ? "tx-in" : "tx-out"}>
                {formatIls(leftoverBar)}
              </strong>
              {toGoalsBar > 0 && (
                <>
                  {" · "}
                  ליעדים {formatIls(toGoalsBar)}
                </>
              )}
            </span>
          ) : sparseSetup && plannedFixed > 0 ? (
            <span className="muted">עדיין לא שולמו — רק התחייבויות</span>
          ) : null
        }
      />

      {(() => {
        const liq =
          data.liquidity ||
          facts?.liquidity ||
          (facts
            ? {
                checkingBalanceNow: facts.checkingBalanceNow,
                reservedForObligations: 0,
                availableInPractice: facts.checkingBalanceNow,
              }
            : {
                checkingBalanceNow: checkingBalance,
                reservedForObligations: 0,
                availableInPractice: checkingBalance,
              });
        const z = liq.availableInPractice;
        const reserved = liq.reservedForObligations;
        const firstAttention = (data.attention || [])[0];
        const checkingMissing = facts?.meta?.hasCheckingAccount === false;
        const zeroCheckingWithReserve =
          Math.abs(liq.checkingBalanceNow) < 0.005 && reserved > 0.005;
        const sparseFlows =
          (facts?.flows.income ?? data.incomeMtd) <= 0 &&
          (facts?.flows.expense ?? data.expenseMtd) > 0;
        const showPartialTrust =
          checkingMissing || zeroCheckingWithReserve || sparseFlows;
        return (
          <>
            {showPartialTrust && (
              <section
                className="card alert-card trust-partial"
                role="status"
                aria-label="תמונה חלקית"
              >
                <strong>התמונה חלקית</strong>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {checkingMissing
                    ? "עדיין אין חשבון עו״ש מוגדר — «זמין בפועל» מחושב בלי יתרה אמיתית."
                    : zeroCheckingWithReserve
                      ? "יתרת העו״ש 0 ויש סכומים שמורים לתשלומים — המספר למטה משקף פער, לא בהכרח מינוס בבנק."
                      : "בחודש זה כמעט אין הכנסות רשומות מול הוצאות — המאזן עלול להטעות עד שתוסיפו תנועות."}
                </p>
                <div className="clarity-actions" style={{ marginTop: "0.65rem", marginBottom: 0 }}>
                  <Link
                    className="btn secondary"
                    href={
                      checkingMissing
                        ? `/app/money?month=${month}`
                        : `/app/money?month=${month}`
                    }
                  >
                    {checkingMissing || zeroCheckingWithReserve
                      ? "לעדכון יתרה / תנועות"
                      : "להוספת תנועות"}
                  </Link>
                </div>
              </section>
            )}
            <section className="clarity-answer" aria-label="זמין בפועל">
              <span className="clarity-answer-label">זמין בפועל</span>
              <div
                className={`clarity-answer-value${z < 0 ? " tx-out" : ""}`}
              >
                {formatIls(z)}
              </div>
              {firstAttention && !showPartialTrust && !sparseSetup ? (
                <p className="insight-conclusion" style={{ margin: "0.45rem 0 0" }}>
                  {firstAttention.conclusionHe || firstAttention.titleHe}
                </p>
              ) : null}
              <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                {showPartialTrust
                  ? "מחושב ממה שרשום במערכת — בדקו שהיתרה והתחייבויות מעודכנים"
                  : sparseSetup
                    ? "יתרה פחות שמור לתשלומים מההקמה — יתחדד עם תנועות"
                  : firstAttention
                    ? firstAttention.meaningHe || firstAttention.bodyHe
                    : z < 0
                      ? "מה שבחשבון לא מכסה את מה ששמור לתשלומים"
                      : data.period && data.period.isCurrentMonth === false
                        ? "אחרי שמור לתשלומים לפי תאריכי חיוב חיים"
                        : "אחרי שמור לתשלומים מהיתרה בעו״ש"}
              </p>
            </section>
            <div className="clarity-meaning mt-chips" style={{ display: "flex" }}>
              <span className="mt-chip">
                בחשבון <b>{formatIls(liq.checkingBalanceNow)}</b>
              </span>
              <span className="mt-chip warn">
                שמור לתשלומים <b>{formatIls(reserved)}</b>
              </span>
              <span className={`badge ${riskClass}`}>
                {data.overdraftRisk.alreadyNegative
                  ? "מינוס פעיל"
                  : data.overdraftRisk.level === "high"
                    ? "תזרים דחוק"
                    : data.overdraftRisk.level === "medium"
                      ? "נזילות דקה"
                      : "תזרים יציב"}
              </span>
            </div>
            <div className="clarity-actions">
              {firstAttention && !sparseSetup ? (
                <Link className="btn" href={firstAttention.href}>
                  {firstAttention.ctaHe || "לטפל עכשיו"}
                </Link>
              ) : (
                <Link className="btn" href={`/app/money?month=${month}`}>
                  {sparseSetup ? "הוסיפו תנועה ראשונה" : "הוסף תנועה"}
                </Link>
              )}
              <button
                type="button"
                className="btn secondary"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "הסתר פרטים" : "פרטים נוספים"}
              </button>
            </div>
          </>
        );
      })()}

      <Pulse
        tone={availableNow < 0 ? "hold" : sparseSetup ? "boost" : data.netMtd >= 0 ? "win" : "boost"}
        mark={availableNow < 0 ? "!" : sparseSetup ? "→" : data.netMtd >= 0 ? "✓" : "♥"}
        label={sparseSetup ? "הצעד הבא" : "ליווי רגשי"}
        title={
          availableNow < 0
            ? "יש פער בין יתרה להתחייבויות"
            : sparseSetup
              ? "בסיס טוב — עכשיו נוסיף תנועה אחת"
              : data.netMtd >= 0
                ? "החודש עובד לטובתך"
                : "אתה לא לבד מול המספרים"
        }
        text={
          availableNow < 0
            ? data.overdraftRisk.messageHe ||
              "הזמין בפועל שלילי כי שמור לתשלומים גדול מהיתרה — זה אות לניהול, לא גזר דין."
            : sparseSetup
              ? "הוסיפו קנייה או הכנסה אחת מהחיים האמיתיים — התמונה תתחדד מיד."
              : data.overdraftRisk.messageHe ||
                (data.netMtd >= 0
                  ? "מותר להרגיש הקלה — ואז לבחור צעד קטן שמחזק את הביטחון."
                  : "גם אם החיץ קצר, התמונה כאן כדי להרגיע ולכוון — לא כדי לשפוט.")
        }
      />

      <WinStrip
        items={[
          ...(sparseSetup
            ? [
                {
                  label: "בסיס שהוגדר",
                  value: formatIls(incomeForBar),
                },
              ]
            : [
                {
                  label: "תזרים החודש",
                  value: `${data.netMtd >= 0 ? "+" : ""}${formatIls(data.netMtd)}`,
                },
              ]),
          ...(data.emergencyCushion
            ? [
                {
                  label: "חיץ להפתעות",
                  value:
                    data.emergencyCushion.progressPct < 1
                      ? `יעד ${formatIls(data.emergencyCushion.targetAmount)}`
                      : `${Math.round(data.emergencyCushion.progressPct)}%`,
                },
              ]
            : data.goals[0]
              ? [
                  {
                    label: "יעד מוביל",
                    value: `${Math.round(data.goals[0].progressPct)}%`,
                  },
                ]
              : []),
        ]}
      />

      {!sparseSetup && (
      <FeelRow
        items={[
          {
            emo: "להבין",
            title: "מה המספר אומר",
            text: "«זמין בפועל» הוא מה שנשאר אחרי שתשלומים ידועים כבר שמורים בצד.",
          },
          {
            emo: "להרגיש",
            title: "מה מותר להרגיש",
            text:
              availableNow < 0
                ? "לחץ אפשרי — והוא לא אומר שאתם «נכשלים». יש תמונה, אפשר לנהל."
                : data.netMtd >= 0
                  ? "הקלה. יש כיוון. מותר לגאווה קטנה בלי להתעלם ממה שעוד חסר."
                  : "לחץ אפשרי — והוא לא אומר שאתם «נכשלים». יש תמונה, אפשר לנהל.",
          },
          {
            emo: "לעשות",
            title: "צעד אחד בלבד",
            text: "בחרו פעולה קטנה אחת מהרשימה למטה — לא לתקן הכול היום.",
            hold: true,
          },
        ]}
      />
      )}

      {!sparseSetup &&
        (data.dataGaps || []).map((g) => (
        <section key={g.id} className="card alert-card insight-card" role="status">
          <div className="insight-block">
            <strong className="insight-conclusion">{g.titleHe}</strong>
            <p className="insight-meaning muted">{g.bodyHe}</p>
            <div className="clarity-actions" style={{ marginBottom: 0 }}>
              <Link className="btn secondary" href={g.href}>
                {g.ctaHe}
              </Link>
            </div>
          </div>
        </section>
      ))}

      {!sparseSetup && (data.attention || []).length > 0 && (
        <section className="card" aria-label="מסקנות לחודש">
          <h2 style={{ marginTop: 0, marginBottom: "0.65rem" }}>
            מסקנות לחודש
          </h2>
          {(data.attention || [])
            .slice(0, showDetails ? undefined : 2)
            .map((item) => {
              const conclusion = item.conclusionHe || item.titleHe;
              const meaning = item.meaningHe || item.bodyHe;
              return (
                <div
                  key={item.id}
                  className={`insight-item${item.severity === "high" ? " insight-item-high" : ""}`}
                >
                  <div className="insight-block">
                    <strong className="insight-conclusion">{conclusion}</strong>
                    <p className="insight-meaning muted">{meaning}</p>
                    {item.moneyLineHe ? (
                      <p className="insight-money">{item.moneyLineHe}</p>
                    ) : null}
                    <div className="clarity-actions" style={{ marginBottom: 0 }}>
                      <Link className="btn secondary" href={item.href}>
                        {item.ctaHe}
                      </Link>
                      {item.alertId ? (
                        <button
                          className="btn quiet"
                          type="button"
                          onClick={() =>
                            snooze(item.alertId!).catch(() => undefined)
                          }
                        >
                          לא עכשיו
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
        </section>
      )}

      {showDetails && (
      <div className="clarity-details">
      {b && (
        <section className="card budget-flow">
          <h2 style={{ marginTop: 0, marginBottom: "0.65rem" }}>
            איך ההכנסות מתחלקות
          </h2>
          <BudgetPie
            income={b.incomeActual}
            fixed={
              b.fixed.actualTotal > 0
                ? b.fixed.actualTotal
                : b.fixed.expectedTotal
            }
            flexible={b.flexible.actualTotal}
            toGoals={b.allocatedToGoals || 0}
            leftover={b.leftover}
          />
          <p className="muted" style={{ margin: "0.65rem 0 0", fontSize: "0.85rem" }}>
            {b.flexible.cap != null
              ? `תקרת גמיש ${formatIls(b.flexible.cap)} · נותר לתקרה ${formatIls(b.flexible.remainingToCap || 0)}`
              : "קבועים מחויבים · גמיש לפי בחירה · נותר ליעדים"}
            {b.fixed.basisForLeftover === "expected"
              ? " · קבועים לפי צפוי (עדיין לא שולמו)"
              : ""}
            {" · "}
            <Link href={`/app/reports?month=${month}`}>פירוט במאזן ←</Link>
          </p>
        </section>
      )}

      <div className="stat-strip">
        <span>
          נטו <strong>{formatIls(data.netMtd)}</strong>
          <span className="muted" style={{ fontSize: "0.75rem", marginInlineStart: "0.35rem" }}>
            אחרי הוצאות וליעדים
          </span>
        </span>
        <span>
          שלמות <strong>{data.completeness}%</strong>
        </span>
      </div>

      {data.cashFlowForecast &&
        (data.cashFlowForecast.expectedFixedExpenses > 0 ||
          data.cashFlowForecast.expectedIncome > 0) && (
          <section className="card">
            <h2 style={{ marginTop: 0 }}>
              תחזית · {data.cashFlowForecast.nextMonthLabelHe}
            </h2>
            <div className="stat-strip" style={{ marginBottom: "0.5rem" }}>
              <span>
                הכנסה צפויה{" "}
                <strong className="tx-in">
                  {formatIls(data.cashFlowForecast.expectedIncome)}
                </strong>
              </span>
              <span>
                קבועים{" "}
                <strong className="tx-out">
                  {formatIls(data.cashFlowForecast.expectedFixedExpenses)}
                </strong>
              </span>
              <span>
                נטו משוער{" "}
                <strong>
                  {formatIls(data.cashFlowForecast.projectedNet)}
                </strong>
              </span>
            </div>
            {data.cashFlowForecast.items.length > 0 && (
              <ul style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                {data.cashFlowForecast.items.slice(0, 5).map((it, i) => (
                  <li key={`${it.titleHe}-${i}`} className="muted">
                    {it.titleHe} · {formatIls(it.amount)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

      {data.budgetSuggestions && data.budgetSuggestions.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>
            זיהינו חיובים קבועים — לאשר?
          </h2>
          {data.budgetSuggestions.map((s) => (
            <div className="list-row" key={`${s.merchantNorm}-${s.categoryKey}`}>
              <div>
                <strong>{s.titleHe}</strong>
                <div className="muted">
                  {formatIls(s.expectedAmount)} / חודש · נראה ב־
                  {s.monthsSeen} חודשים
                </div>
              </div>
              <button
                className="btn secondary"
                type="button"
                disabled={busySuggest === s.merchantNorm}
                onClick={() => confirmSuggestion(s)}
              >
                אישור
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card">
          <div className="list-row" style={{ border: "none", padding: 0 }}>
            <div className="liquidity-hero" style={{ gap: "0.1rem" }}>
              <span className="muted liquidity-label">אשראי והלוואות</span>
              <strong style={{ fontSize: "1.25rem" }}>
                {formatIls(data.debtsSummary?.principalTotal ?? 0)}
              </strong>
            </div>
            <Link className="btn secondary" href={`/app/debts?month=${month}`}>
              לפירוט ←
            </Link>
          </div>
        </section>

      {data.emergencyCushion ? (
        <section className="card">
          <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
            <h2 style={{ margin: 0 }}>רזרבה להפתעות</h2>
            <Link href={`/app/goals?month=${month}`}>ליעדים ←</Link>
          </div>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
            {data.emergencyCushion.full
              ? "הרזרבה מלאה — אפשר להפנות פנוי ליעדים אחרים."
              : "סכום שמפרידים מהשוטף כדי לא לחזור למינוס כשמשהו נשבר."}
          </p>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "var(--bg-soft)",
              overflow: "hidden",
              marginTop: "0.55rem",
            }}
          >
            <div
              style={{
                width: `${data.emergencyCushion.progressPct}%`,
                height: "100%",
                background: "var(--accent, #1a7a66)",
              }}
            />
          </div>
          <p className="muted" style={{ margin: "0.45rem 0 0", fontSize: "0.85rem" }}>
            {data.emergencyCushion.full
              ? `הושלם · ${formatIls(data.emergencyCushion.targetAmount)}`
              : `${formatIls(data.emergencyCushion.currentAmount)} מתוך ${formatIls(data.emergencyCushion.targetAmount)}${
                  data.emergencyCushion.remaining != null &&
                  data.emergencyCushion.remaining > 0
                    ? ` · נשאר ${formatIls(data.emergencyCushion.remaining)}`
                    : ""
                }`}
          </p>
        </section>
      ) : data.reservePrompt ? (
        <section className="card goals-cushion-cta">
          <div>
            <strong>רזרבה להפתעות</strong>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              יש נותר החודש — כדאי להתחיל סכום קטן להגנה מפני הפתעות.
            </p>
          </div>
          <Link className="btn" href={`/app/goals?month=${month}&reserve=1`}>
            להתחיל רזרבה
          </Link>
        </section>
      ) : null}

      {data.categoryBreakdown.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>הוצאות לפי קטגוריה</h2>
          <CategoryBars items={data.categoryBreakdown.slice(0, 6)} />
          <p style={{ marginBottom: 0 }}>
            <Link href={`/app/reports?month=${month}`}>למאזן המלא ←</Link>
          </p>
        </section>
      )}

      <section className="card">
        <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
          <h2 style={{ margin: 0 }}>יעדים</h2>
          <Link href="/app/goals">הכל ←</Link>
        </div>
        {data.goals.length === 0 && (
          <p className="muted">עדיין אין יעדים</p>
        )}
        {data.goals.slice(0, 3).map((g) => (
          <div className="list-row" key={g.id}>
            <div>
              <strong>{g.title}</strong>
              <div className="muted">
                {formatIls(g.currentAmount)} מתוך {formatIls(g.targetAmount)}
                {goalExtras[g.id]?.pace
                  ? ` · ${goalExtras[g.id].pace}`
                  : ""}
                {goalExtras[g.id]?.etaMonth
                  ? ` · צפוי ${labelMonthHe(goalExtras[g.id].etaMonth!)}`
                  : ""}
              </div>
            </div>
            <div>{g.progressPct}%</div>
          </div>
        ))}
        {b && b.leftover > 0 && data.goals.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            {!surplusConfirm ? (
              <>
                <p className="muted" style={{ margin: "0 0 0.4rem", fontSize: "0.9rem" }}>
                  נותר החודש {formatIls(b.leftover)} — הקצאה ליעד (תישמר גם כתנועת ליעדים)
                </p>
                <div
                  className="list-row"
                  style={{ border: "none", padding: 0, gap: "0.5rem", flexWrap: "wrap" }}
                >
                  <select
                    value={surplusGoalId || data.goals[0]?.id || ""}
                    onChange={(e) => setSurplusGoalId(e.target.value)}
                  >
                    {data.goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={String(Math.round(b.leftover))}
                    value={surplusAmount}
                    onChange={(e) => setSurplusAmount(e.target.value)}
                    style={{ width: "7rem" }}
                  />
                  <button
                    className="btn"
                    type="button"
                    disabled={busySurplus}
                    onClick={() => applySurplus()}
                  >
                    המשך לאישור
                  </button>
                  <Link href={`/app/goals?month=${month}`} className="muted" style={{ fontSize: "0.85rem" }}>
                    ליעדים ←
                  </Link>
                </div>
              </>
            ) : (
              <div className="confirm-panel" style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "12px" }}>
                <p className="muted" style={{ marginTop: 0 }}>
                  לאשר הקצאת{" "}
                  <strong>
                    {formatIls(
                      Number(
                        surplusAmount ||
                          Math.round(
                            Math.min(b.leftover, 500),
                          ),
                      ),
                    )}
                  </strong>{" "}
                  ליעד? תירשם תנועת <strong>ליעדים</strong> לחודש {month}.
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn"
                    type="button"
                    disabled={busySurplus}
                    onClick={() => applySurplus()}
                  >
                    אישור הקצאה
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setSurplusConfirm(false)}
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {b && b.leftover > 0 && data.goals.length === 0 && (
          <p className="muted" style={{ marginBottom: 0, fontSize: "0.9rem" }}>
            נותר החודש {formatIls(b.leftover)} —{" "}
            <Link href="/app/goals">צרו יעד</Link> כדי להקצות
          </p>
        )}
      </section>

      <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
        {data.freshness.noteHe}
      </p>
      </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <DashboardInner />
    </Suspense>
  );
}
