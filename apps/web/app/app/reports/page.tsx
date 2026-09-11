"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { api, apiDownload, formatIls } from "@/lib/api";
import { BudgetPie, CategoryBars, MomBars } from "@/components/Charts";
import {
  PeriodBar,
  labelMonthHe,
  useSelectedMonth,
} from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { PageDock } from "@/components/PageDock";

type ReportsView = "summary" | "categories" | "trend";

type Report = {
  monthsBack: number;
  selectedMonth?: string;
  narrativeHe: string;
  mom: {
    income: { current: number; previous: number; deltaPct: number };
    expense: { current: number; previous: number; deltaPct: number };
    net: { current: number; previous: number; deltaPct: number };
  };
  monthlySeries: Array<{
    month: string;
    income: number;
    expense: number;
    allocatedToGoals?: number;
    net: number;
    netAfterGoals?: number;
  }>;
  categoryBreakdown: Array<{
    key: string;
    labelHe: string;
    amount: number;
    sharePct: number;
  }>;
  incomeBreakdown?: Array<{
    key: string;
    labelHe: string;
    amount: number;
    sharePct: number;
  }>;
  balanceSheet?: {
    month: string;
    incomeTotal: number;
    expenseTotal: number;
    allocatedToGoals?: number;
    leftover?: number;
    net: number;
    incomeByCategory: Array<{
      key: string;
      labelHe: string;
      amount: number;
      sharePct: number;
    }>;
    expenseByCategory: Array<{
      key: string;
      labelHe: string;
      amount: number;
      sharePct: number;
    }>;
    topTransactions: Array<{
      id: string;
      direction: string;
      amount: number;
      categoryKey?: string;
      categoryLabelHe: string;
      description: string | null;
      bookedAt: string;
    }>;
  };
  expenseByNature?: {
    fixed: {
      total: number;
      items: Array<{
        key: string;
        labelHe: string;
        amount: number;
        sharePct: number;
      }>;
    };
    variable: {
      total: number;
      items: Array<{
        key: string;
        labelHe: string;
        amount: number;
        sharePct: number;
      }>;
    };
  };
  formulaVersion?: string;
  monthFacts?: {
    flows: {
      income: number;
      expense: number;
      allocatedToGoals: number;
      net: number;
      netAfterGoals?: number;
    };
    budget: {
      leftover: number;
      fixed: {
        expectedTotal: number;
        actualTotal: number;
        basisForLeftover?: "expected" | "actual";
      };
      flexible: { actualTotal: number };
    };
  };
};

type BudgetSnap = {
  incomeActual: number;
  fixed: {
    expectedTotal: number;
    actualTotal: number;
    basisForLeftover?: "expected" | "actual";
  };
  flexible: { actualTotal: number };
  leftover: number;
  allocatedToGoals?: number;
};

function Delta({ pct, invert }: { pct: number; invert?: boolean }) {
  const bad = invert ? pct < 0 : pct > 0;
  const cls = pct === 0 ? "muted" : bad ? "delta-up" : "delta-down";
  return (
    <span className={cls}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function moneyHref(
  month: string,
  opts?: { category?: string; dir?: string },
) {
  const p = new URLSearchParams();
  p.set("month", month);
  if (opts?.category) p.set("category", opts.category);
  if (opts?.dir) p.set("dir", opts.dir);
  return `/app/money?${p.toString()}`;
}

const TREND_PRESETS = [3, 6, 9, 12] as const;

function ReportsInner() {
  const month = useSelectedMonth();
  const [data, setData] = useState<Report | null>(null);
  const [budget, setBudget] = useState<BudgetSnap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [customMonths, setCustomMonths] = useState("6");
  const [trendMode, setTrendMode] = useState<"preset" | "custom">("preset");
  const [exportBusy, setExportBusy] = useState(false);
  const [view, setView] = useState<ReportsView>("summary");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    setBudget(null);
    api<Report>(`/reports/overview?months=${months}&month=${month}`)
      .then((report) => {
        if (cancelled) return;
        setData(report);
        if (report.monthFacts) {
          setBudget({
            incomeActual: report.monthFacts.flows.income,
            fixed: report.monthFacts.budget.fixed,
            flexible: report.monthFacts.budget.flexible,
            leftover: report.monthFacts.budget.leftover,
            allocatedToGoals: report.monthFacts.flows.allocatedToGoals,
          });
        } else {
          setBudget(null);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "שגיאה");
      });
    return () => {
      cancelled = true;
    };
  }, [months, month]);

  async function exportCsv() {
    setExportBusy(true);
    setExportError(null);
    try {
      await apiDownload(
        `/reports/overview.csv?month=${month}`,
        `moneytail-balance-${month}.csv`,
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "שגיאת ייצוא");
    } finally {
      setExportBusy(false);
    }
  }

  function applyCustomMonths() {
    const n = Math.min(24, Math.max(2, Number(customMonths) || 6));
    setCustomMonths(String(n));
    setTrendMode("custom");
    setMonths(n);
  }

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return <p className="mt-state mt-state-loading">טוען מאזן…</p>;

  const sheet = data.balanceSheet;
  const facts = data.monthFacts;
  const income =
    facts?.flows.income ?? sheet?.incomeTotal ?? data.mom.income.current;
  const expense =
    facts?.flows.expense ?? sheet?.expenseTotal ?? data.mom.expense.current;
  const toGoalsAmt =
    facts?.flows.allocatedToGoals ??
    budget?.allocatedToGoals ??
    sheet?.allocatedToGoals ??
    0;
  const net =
    facts?.flows.netAfterGoals ??
    sheet?.net ??
    income - expense - toGoalsAmt;
  const txCount = sheet?.topTransactions?.length ?? 0;
  const sparse =
    (income <= 0 && expense > 0) ||
    (income <= 0 && expense <= 0) ||
    (expense > 0 &&
      txCount > 0 &&
      txCount < 3 &&
      data.mom.expense.previous > expense * 2);

  const fixedAmt =
    budget && budget.fixed.actualTotal > 0
      ? budget.fixed.actualTotal
      : budget?.fixed.expectedTotal ??
        data.expenseByNature?.fixed.total ??
        0;
  const flexAmt =
    budget?.flexible.actualTotal ?? data.expenseByNature?.variable.total ?? 0;
  const toGoals = toGoalsAmt;
  const leftoverAmt =
    budget?.leftover ??
    sheet?.leftover ??
    income - fixedAmt - flexAmt - toGoals;

  const expenseHref = (item: { key?: string }) =>
    item.key
      ? moneyHref(month, { category: item.key, dir: "EXPENSE" })
      : undefined;
  const incomeHref = (item: { key?: string }) =>
    item.key
      ? moneyHref(month, { category: item.key, dir: "INCOME" })
      : undefined;

  const trendTotals = data.monthlySeries.reduce(
    (acc, m) => {
      const goals = m.allocatedToGoals || 0;
      const netAfter =
        m.netAfterGoals ?? m.net - goals;
      return {
        income: acc.income + m.income,
        expense: acc.expense + m.expense,
        toGoals: acc.toGoals + goals,
        net: acc.net + netAfter,
      };
    },
    { income: 0, expense: 0, toGoals: 0, net: 0 },
  );

  return (
    <div className="grid reports-page has-page-dock" style={{ gap: "0.85rem" }}>
      <PageHeader
        kicker="מאזן"
        title="מה נכנס · מה יצא"
        subtitle={`${labelMonthHe(month)} · מה קרה החודש`}
        actions={
          <button
            className="btn secondary"
            type="button"
            disabled={exportBusy}
            onClick={() => exportCsv()}
          >
            ייצוא CSV
          </button>
        }
      />

      {exportError && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          {exportError}
        </p>
      )}

      <PeriodBar
        income={income}
        expense={expense}
        extra={
          <>
            {toGoals > 0 && (
              <span>
                ליעדים <strong>{formatIls(toGoals)}</strong>
              </span>
            )}
            {budget && (
              <span>
                נותר החודש{" "}
                <strong className={leftoverAmt >= 0 ? "tx-in" : "tx-out"}>
                  {formatIls(leftoverAmt)}
                </strong>
              </span>
            )}
          </>
        }
      />

      {view === "summary" && (
        <>
          {sparse && (
            <section className="card alert-card insight-card" role="status">
              <div className="insight-block">
                <strong className="insight-conclusion">
                  {income <= 0 && expense > 0
                    ? "חסרות הכנסות בחודש"
                    : income <= 0 && expense <= 0
                      ? "בחודש זה עדיין אין תנועות"
                      : "התמונה עדיין חלקית"}
                </strong>
                <p className="insight-meaning muted">
                  כדאי לייבא דף חשבון או להוסיף תנועות — בינתיים המאזן עלול להטעות, ולכן לא נציג אזהרות חזקות.
                </p>
                <div className="clarity-actions" style={{ marginBottom: 0 }}>
                  <Link
                    className="btn secondary"
                    href={`/app/money?month=${month}&tab=import`}
                  >
                    לייבוא
                  </Link>
                </div>
              </div>
            </section>
          )}

          <section className="clarity-answer report-hero void-hero" aria-label="נטו החודש">
            <span className="clarity-answer-label">
              נטו אחרי הוצאות וליעדים · {labelMonthHe(month)}
            </span>
            <div
              className={`clarity-answer-value${net >= 0 ? " tx-in" : " tx-out"}`}
            >
              {net >= 0 ? "+" : ""}
              {formatIls(net)}
            </div>
            {data.narrativeHe ? (
              <p className="insight-conclusion report-narrative">
                {data.narrativeHe}
              </p>
            ) : null}
            <div className="clarity-meaning" style={{ paddingBottom: 0 }}>
              <span>
                מול חודש קודם · <Delta pct={data.mom.net.deltaPct} invert />
              </span>
              {toGoals > 0 && (
                <span>
                  ליעדים
                  <strong>{formatIls(toGoals)}</strong>
                </span>
              )}
              <span>
                הוצאות
                <strong>{formatIls(expense)}</strong>
              </span>
            </div>
            <div className="clarity-actions" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
              <Link className="btn secondary" href={`/app/money?month=${month}`}>
                לתנועות
              </Link>
            </div>
          </section>

          {(income > 0 || fixedAmt > 0 || flexAmt > 0 || toGoals > 0) && (
            <section className="card">
              <h2 style={{ marginTop: 0, marginBottom: "0.65rem" }}>
                איך ההכנסות מתחלקות
              </h2>
              <BudgetPie
                income={budget?.incomeActual ?? income}
                fixed={fixedAmt}
                flexible={flexAmt}
                toGoals={toGoals}
                leftover={leftoverAmt}
              />
              {budget?.fixed.basisForLeftover === "expected" && (
                <p className="muted" style={{ margin: "0.65rem 0 0", fontSize: "0.85rem" }}>
                  קבועים לפי צפוי — עדיין לא נרשמו תשלומים לחודש זה
                </p>
              )}
            </section>
          )}
        </>
      )}

      {view === "trend" && (
      <section className="card report-trend">
        <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
          <h2 style={{ margin: 0 }}>מגמת {months} חודשים</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            עד {labelMonthHe(month)}
          </span>
        </div>

        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          סכומים לכל הטווח · בגרף — פירוט לפי חודש
        </p>

        <div className="trend-summary">
          <span className="tx-in">
            הכנסות <strong>{formatIls(trendTotals.income)}</strong>
          </span>
          <span className="tx-out">
            הוצאות <strong>{formatIls(trendTotals.expense)}</strong>
          </span>
          {trendTotals.toGoals > 0 && (
            <span>
              ליעדים <strong>{formatIls(trendTotals.toGoals)}</strong>
            </span>
          )}
          <span className={trendTotals.net >= 0 ? "tx-in" : "tx-out"}>
            נטו <strong>{formatIls(trendTotals.net)}</strong>
          </span>
        </div>

        <div className="trend-controls">
          <div className="trend-presets">
            {TREND_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={`trend-chip${
                  trendMode === "preset" && months === n ? " active" : ""
                }`}
                onClick={() => {
                  setTrendMode("preset");
                  setMonths(n);
                  setCustomMonths(String(n));
                }}
              >
                {n} חודשים
              </button>
            ))}
            <button
              type="button"
              className={`trend-chip${trendMode === "custom" ? " active" : ""}`}
              onClick={() => setTrendMode("custom")}
            >
              מותאם
            </button>
          </div>
          {trendMode === "custom" && (
            <label className="inline-field trend-custom">
              <span className="muted">מספר חודשים</span>
              <input
                type="number"
                min={2}
                max={24}
                value={customMonths}
                onChange={(e) => setCustomMonths(e.target.value)}
                onBlur={() => applyCustomMonths()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyCustomMonths();
                }}
                style={{ width: "4.5rem" }}
              />
            </label>
          )}
        </div>

        <div className="chart-legend">
          <span className="lg-income">הכנסות</span>
          <span className="lg-expense">הוצאות</span>
          <span className="lg-goals">ליעדים</span>
        </div>
        <MomBars
          series={data.monthlySeries.map((m) => ({
            label: m.month,
            income: m.income,
            expense: m.expense,
            toGoals: m.allocatedToGoals || 0,
            net: m.netAfterGoals ?? m.net - (m.allocatedToGoals || 0),
          }))}
        />
      </section>
      )}

      {view === "categories" && (
        <>
      <section className="balance-sheet">
        <div className="card">
          <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
            <h2 style={{ margin: 0 }}>הכנסות</h2>
            <Link
              className="muted"
              href={moneyHref(month, { dir: "INCOME" })}
              style={{ fontSize: "0.85rem" }}
            >
              כל ההכנסות ←
            </Link>
          </div>
          <div className="stat-value tx-in">{formatIls(income)}</div>
          <p className="muted">
            מול חודש קודם · <Delta pct={data.mom.income.deltaPct} invert />
          </p>
          {(sheet?.incomeByCategory || data.incomeBreakdown || []).length ===
          0 ? (
            <p className="muted">אין הכנסות בחודש</p>
          ) : (
            <CategoryBars
              items={(
                sheet?.incomeByCategory ||
                data.incomeBreakdown ||
                []
              ).slice(0, 8)}
              hrefFor={incomeHref}
            />
          )}
        </div>
        <div className="card">
          <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
            <h2 style={{ margin: 0 }}>הוצאות</h2>
            <Link
              className="muted"
              href={moneyHref(month, { dir: "EXPENSE" })}
              style={{ fontSize: "0.85rem" }}
            >
              כל ההוצאות ←
            </Link>
          </div>
          <div className="stat-value tx-out">{formatIls(expense)}</div>
          <p className="muted">
            מול חודש קודם · <Delta pct={data.mom.expense.deltaPct} />
          </p>
          {data.expenseByNature ? (
            <div className="grid" style={{ gap: "0.85rem", marginTop: "0.75rem" }}>
              <div>
                <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
                  קבועים · {formatIls(data.expenseByNature.fixed.total)}
                </h3>
                {data.expenseByNature.fixed.items.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    אין הוצאות קבועות
                  </p>
                ) : (
                  <CategoryBars
                    items={data.expenseByNature.fixed.items.slice(0, 6)}
                    hrefFor={expenseHref}
                  />
                )}
              </div>
              <div>
                <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
                  גמיש · {formatIls(data.expenseByNature.variable.total)}
                </h3>
                {data.expenseByNature.variable.items.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    אין הוצאות גמישות
                  </p>
                ) : (
                  <CategoryBars
                    items={data.expenseByNature.variable.items.slice(0, 6)}
                    hrefFor={expenseHref}
                  />
                )}
              </div>
            </div>
          ) : (sheet?.expenseByCategory || data.categoryBreakdown).length ===
            0 ? (
            <p className="muted">אין הוצאות בחודש</p>
          ) : (
            <CategoryBars
              items={(
                sheet?.expenseByCategory || data.categoryBreakdown
              ).slice(0, 8)}
              hrefFor={expenseHref}
            />
          )}
        </div>
      </section>

      <section className="card">
        <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
          <h2 style={{ margin: 0 }}>תנועות גדולות</h2>
          <Link
            className="muted"
            href={moneyHref(month)}
            style={{ fontSize: "0.85rem" }}
          >
            כל התנועות ←
          </Link>
        </div>
        {!sheet?.topTransactions?.length ? (
          <p className="muted">אין תנועות</p>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>עבור מה</th>
                <th>קטלוג</th>
                <th>סכום</th>
              </tr>
            </thead>
            <tbody>
              {sheet.topTransactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    {new Date(t.bookedAt).toLocaleDateString("he-IL")}
                  </td>
                  <td>
                    {t.categoryKey ? (
                      <Link
                        href={moneyHref(month, {
                          category: t.categoryKey,
                          dir: t.direction,
                        })}
                      >
                        {t.description || "—"}
                      </Link>
                    ) : (
                      t.description || "—"
                    )}
                  </td>
                  <td>
                    {t.categoryKey ? (
                      <Link
                        className="muted"
                        href={moneyHref(month, {
                          category: t.categoryKey,
                          dir: t.direction,
                        })}
                      >
                        {t.categoryLabelHe}
                      </Link>
                    ) : (
                      t.categoryLabelHe
                    )}
                  </td>
                  <td
                    className={
                      t.direction === "INCOME" ? "tx-in" : "tx-out"
                    }
                  >
                    {t.direction === "INCOME" ? "+" : "-"}
                    {formatIls(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
        </>
      )}

      <PageDock
        ariaLabel="מצבי מאזן"
        value={view}
        onChange={(id) => setView(id as ReportsView)}
        items={[
          { id: "summary", label: "סיכום" },
          { id: "categories", label: "קטגוריות" },
          { id: "trend", label: "מגמה" },
        ]}
      />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <ReportsInner />
    </Suspense>
  );
}
