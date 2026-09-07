"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatIls } from "@/lib/api";
import { CategoryBars, BudgetPie } from "@/components/Charts";
import { PeriodBar, useSelectedMonth, labelMonthHe } from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";

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

  async function dismiss(id: string) {
    await api(`/alerts/${id}/dismiss`, { method: "POST", body: "{}" });
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
    return <p style={{ color: "var(--danger)" }}>{error}</p>;
  }
  if (!data) {
    return <p className="muted">טוען את המצב שלך…</p>;
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
  const toGoalsBar =
    facts?.flows.allocatedToGoals ??
    data.allocatedToGoalsMtd ??
    b?.allocatedToGoals ??
    0;
  const leftoverBar = facts?.budget.leftover ?? b?.leftover;

  return (
    <div className="grid" style={{ gap: "0.85rem" }}>
      <PageHeader
        title="תמונת מצב"
        subtitle={
          <>
            <div>סיכום מהיר לחודש הנבחר</div>
            {data.narrativeHe ? <div>{data.narrativeHe}</div> : null}
          </>
        }
      />

      <PeriodBar
        balance={data.availableBalance}
        income={incomeForBar}
        expense={expenseForBar}
        extra={
          leftoverBar != null ? (
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
          ) : null
        }
      />

      {(data.dataGaps || []).map((g) => (
        <section key={g.id} className="card alert-card">
          <div className="list-row" style={{ border: "none", padding: 0 }}>
            <div>
              <strong>{g.titleHe}</strong>
              <div className="muted">{g.bodyHe}</div>
            </div>
            <Link className="btn secondary" href={g.href}>
              {g.ctaHe}
            </Link>
          </div>
        </section>
      ))}

      {(data.overdraftRisk.level === "high" ||
        data.overdraftRisk.level === "medium") && (
        <section
          className={`card alert-card${data.overdraftRisk.level === "high" ? " high" : ""}`}
        >
          <strong>
            {data.overdraftRisk.alreadyNegative
              ? "עומס משיכת יתר"
              : "סיכון מינוס"}
          </strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            {data.overdraftRisk.messageHe}
          </p>
        </section>
      )}

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
        <span className={`badge ${riskClass}`}>
          {data.overdraftRisk.alreadyNegative
            ? "מינוס פעיל"
            : data.overdraftRisk.level === "high"
              ? "סיכון מינוס"
              : data.overdraftRisk.level === "medium"
                ? "נזילות דקה"
                : "תזרים יציב"}
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

      {data.alerts[0] && (
        <section
          className={`card alert-card${data.alerts[0].severity === "high" ? " high" : ""}`}
        >
          <div className="list-row" style={{ border: "none", padding: 0 }}>
            <div>
              <strong>{data.alerts[0].titleHe}</strong>
              <div className="muted">{data.alerts[0].bodyHe}</div>
            </div>
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                dismiss(data.alerts[0].id).catch(() => undefined)
              }
            >
              סגור
            </button>
          </div>
        </section>
      )}

      {data.categoryBreakdown.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>הוצאות לפי קטגוריה</h2>
          <CategoryBars items={data.categoryBreakdown.slice(0, 6)} />
          <p style={{ marginBottom: 0 }}>
            <Link href={`/app/reports?month=${month}`}>למאזן המלא ←</Link>
          </p>
        </section>
      )}

      {data.recommendations[0] && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>המלצה</h2>
          <h3 style={{ marginBottom: "0.3rem" }}>
            {data.recommendations[0].titleHe}
          </h3>
          <p className="muted">{data.recommendations[0].bodyHe}</p>
        </section>
      )}

      {data.patterns[0] && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>דפוס</h2>
          <strong>{data.patterns[0].titleHe}</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            {data.patterns[0].bodyHe}
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
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <DashboardInner />
    </Suspense>
  );
}
