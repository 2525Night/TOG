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
    net: number;
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
};

type BudgetSnap = {
  incomeActual: number;
  fixed: { expectedTotal: number; actualTotal: number };
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

  useEffect(() => {
    setError(null);
    Promise.all([
      api<Report>(`/reports/overview?months=${months}&month=${month}`),
      api<BudgetSnap>(`/budget/snapshot?month=${month}`).catch(() => null),
    ])
      .then(([report, snap]) => {
        setData(report);
        setBudget(snap);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"));
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

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!data) return <p className="muted">טוען מאזן…</p>;

  const sheet = data.balanceSheet;
  const income = sheet?.incomeTotal ?? data.mom.income.current;
  const expense = sheet?.expenseTotal ?? data.mom.expense.current;
  const net = sheet?.net ?? data.mom.net.current;
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
  const toGoals = budget?.allocatedToGoals ?? 0;
  const leftoverAmt =
    budget?.leftover ?? Math.max(0, income - fixedAmt - flexAmt - toGoals);

  const expenseHref = (item: { key?: string }) =>
    item.key
      ? moneyHref(month, { category: item.key, dir: "EXPENSE" })
      : undefined;
  const incomeHref = (item: { key?: string }) =>
    item.key
      ? moneyHref(month, { category: item.key, dir: "INCOME" })
      : undefined;

  return (
    <div className="grid reports-page" style={{ gap: "0.85rem" }}>
      <PageHeader
        title="מאזן"
        subtitle={`${labelMonthHe(month)} · פירוט החודש`}
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
        <p style={{ color: "var(--danger)", margin: 0 }}>{exportError}</p>
      )}

      <PeriodBar
        income={income}
        expense={expense}
        extra={
          <span className={net >= 0 ? "tx-in" : "tx-out"}>
            נטו החודש <strong>{formatIls(net)}</strong>
          </span>
        }
      />

      {sparse && (
        <section className="card alert-card">
          <div className="list-row" style={{ border: "none", padding: 0 }}>
            <div>
              <strong>
                {income <= 0 && expense > 0
                  ? "חסרות הכנסות בחודש"
                  : income <= 0 && expense <= 0
                    ? "אין תנועות בחודש זה"
                    : "נתונים חלקיים לחודש"}
              </strong>
              <div className="muted">
                כדאי לייבא דף חשבון או להוסיף תנועות — אחרת המאזן עלול להטעות.
              </div>
            </div>
            <Link
              className="btn secondary"
              href={`/app/money?month=${month}&tab=import`}
            >
              לייבוא
            </Link>
          </div>
        </section>
      )}

      <section className="card report-hero">
        <div className="report-hero-main">
          <div className="muted">נטו · {labelMonthHe(month)}</div>
          <div
            className={`stat-value${net >= 0 ? " tx-in" : " tx-out"}`}
            style={{ margin: "0.15rem 0" }}
          >
            {net >= 0 ? "+" : ""}
            {formatIls(net)}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            מול חודש קודם · <Delta pct={data.mom.net.deltaPct} invert />
          </p>
        </div>
        {data.narrativeHe && (
          <p className="muted report-hero-note" style={{ margin: 0 }}>
            {data.narrativeHe}
          </p>
        )}
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
            leftover={Math.max(0, leftoverAmt)}
          />
        </section>
      )}

      <section className="card report-trend">
        <div className="list-row" style={{ border: "none", paddingTop: 0 }}>
          <h2 style={{ margin: 0 }}>מגמת {months} חודשים</h2>
        </div>

        <div className="trend-summary">
          <span className="tx-in">
            הכנסות <strong>{formatIls(income)}</strong>
          </span>
          <span className="tx-out">
            הוצאות <strong>{formatIls(expense)}</strong>
          </span>
          <span>
            נטו <strong>{formatIls(net)}</strong>
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
        </div>
        <MomBars
          series={data.monthlySeries.map((m) => ({
            label: m.month,
            income: m.income,
            expense: m.expense,
            net: m.net,
          }))}
        />
      </section>

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
