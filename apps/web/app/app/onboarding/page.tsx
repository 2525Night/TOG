"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type ExpenseRow = {
  label: string;
  categoryKey: string;
  amount: string;
};

const defaultExpenses: ExpenseRow[] = [
  { label: "שכירות / משכנתא", categoryKey: "housing", amount: "" },
  { label: "סלולר", categoryKey: "cellular", amount: "" },
  { label: "מזון", categoryKey: "food", amount: "" },
  { label: "תחבורה", categoryKey: "transport", amount: "" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [accountName, setAccountName] = useState("עו״ש ראשי");
  const [startingBalance, setStartingBalance] = useState("0");
  const [monthlyIncomeNet, setMonthlyIncomeNet] = useState("");
  const [expenses, setExpenses] = useState<ExpenseRow[]>(defaultExpenses);
  const [goalTitle, setGoalTitle] = useState("קרן חירום");
  const [goalTargetAmount, setGoalTargetAmount] = useState("10000");
  const [goalCurrentAmount, setGoalCurrentAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const steps = useMemo(
    () => ["חשבון", "הכנסה", "הוצאות קבועות", "יעד"],
    [],
  );

  function updateExpense(index: number, patch: Partial<ExpenseRow>) {
    setExpenses((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fixedExpenses = expenses
        .map((row) => ({
          label: row.label,
          categoryKey: row.categoryKey,
          amount: Number(row.amount) || 0,
        }))
        .filter((row) => row.amount > 0);

      if (fixedExpenses.length < 1) {
        throw new Error("הוסיפו לפחות הוצאה קבועה אחת עם סכום");
      }

      await api("/auth/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          accountName,
          startingBalance: Number(startingBalance) || 0,
          monthlyIncomeNet: Number(monthlyIncomeNet) || 0,
          fixedExpenses,
          goalTitle,
          goalTargetAmount: Number(goalTargetAmount),
          goalCurrentAmount: Number(goalCurrentAmount) || 0,
        }),
      });
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid" style={{ maxWidth: 640, margin: "0 auto" }}>
      <section>
        <h1 style={{ marginBottom: "0.25rem" }}>בואו נתחיל</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          כמה פרטים בסיסיים כדי לבנות תמונת מצב ראשונה. הוצאות קבועות
          נשמרות כהתחייבות תקציבית (לא כתנועות מדומות). אפשר לייבא מסמכים
          (CSV / PDF / תמונה) אחר כך ממסך תנועות → ייבוא — לא חובה כאן.
        </p>
        <div className="step-pills">
          {steps.map((label, i) => (
            <span
              key={label}
              className={`step-pill${i === step ? " active" : ""}`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
      </section>

      <form className="card" onSubmit={finish}>
        {step === 0 && (
          <>
            <h2 style={{ marginTop: 0 }}>חשבון ראשי</h2>
            <label className="field">
              <span>שם החשבון</span>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>יתרה התחלתית (₪)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                required
              />
            </label>
            <button className="btn" type="button" onClick={() => setStep(1)}>
              המשך
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 style={{ marginTop: 0 }}>הכנסה חודשית נטו</h2>
            <label className="field">
              <span>סכום נטו לחודש (₪)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={monthlyIncomeNet}
                onChange={(e) => setMonthlyIncomeNet(e.target.value)}
                required
              />
            </label>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setStep(0)}
              >
                חזרה
              </button>
              <button className="btn" type="button" onClick={() => setStep(2)}>
                המשך
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ marginTop: 0 }}>הוצאות קבועות עיקריות</h2>
            <p className="muted">מלאו לפחות סכום אחד. אפשר להשאיר ריק מה שלא רלוונטי.</p>
            {expenses.map((row, index) => (
              <label className="field" key={row.categoryKey + index}>
                <span>{row.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={row.amount}
                  onChange={(e) =>
                    updateExpense(index, { amount: e.target.value })
                  }
                />
              </label>
            ))}
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setStep(1)}
              >
                חזרה
              </button>
              <button className="btn" type="button" onClick={() => setStep(3)}>
                המשך
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={{ marginTop: 0 }}>יעד ראשון</h2>
            <label className="field">
              <span>שם היעד</span>
              <input
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>סכום יעד (₪)</span>
              <input
                type="number"
                min="1"
                value={goalTargetAmount}
                onChange={(e) => setGoalTargetAmount(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>כמה כבר חסכתם (₪)</span>
              <input
                type="number"
                min="0"
                value={goalCurrentAmount}
                onChange={(e) => setGoalCurrentAmount(e.target.value)}
              />
            </label>
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setStep(2)}
              >
                חזרה
              </button>
              <button className="btn warm" disabled={loading} type="submit">
                {loading ? "שומר…" : "סיימו והיכנסו לתמונת המצב"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
