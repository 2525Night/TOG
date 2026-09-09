"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type ExpenseRow = {
  label: string;
  categoryKey: string;
  amount: string;
  hint: string;
  /** null = pay from account; number = index into local cards list */
  creditCardIndex: number | null;
};

type CardRow = {
  name: string;
  currentBalance: string;
  creditLimit: string;
};

const defaultExpenses: ExpenseRow[] = [
  {
    label: "דיור (שכירות או משכנתא)",
    categoryKey: "housing",
    amount: "",
    hint: "מה שיורד כל חודש על הבית",
    creditCardIndex: null,
  },
  {
    label: "טלפון",
    categoryKey: "cellular",
    amount: "",
    hint: "אופציונלי",
    creditCardIndex: null,
  },
  {
    label: "אוכל וסופר",
    categoryKey: "food",
    amount: "",
    hint: "הערכה גסה מספיקה",
    creditCardIndex: null,
  },
  {
    label: "תחבורה",
    categoryKey: "transport",
    amount: "",
    hint: "דלק, נסיעות, חניה…",
    creditCardIndex: null,
  },
];

const stepMeta = [
  {
    title: "כמה יש בחשבון?",
    blurb: "רק המספר שאתם רואים עכשיו בעו״ש. מינוס בסדר — ככה מתחילים לפעמים.",
  },
  {
    title: "מה נכנס בחודש?",
    blurb: "משכורת או הכנסה נטו אחרי מסים. אפשר לעגל.",
  },
  {
    title: "יש כרטיס אשראי?",
    blurb: "רק אם בא לכם לזכור אותו עכשיו. אפשר גם אחר כך — בלי לחץ.",
  },
  {
    title: "מה יורד כל חודש?",
    blurb: "מלאו מה שרלוונטי. שורה ריקה = מדלגים עליה.",
  },
  {
    title: "רוצים כרית קטנה?",
    blurb: "סכום קטן בצד להפתעות — לא חובה. אפשר לדלג ולהתחיל.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [accountName] = useState("העו״ש שלי");
  const [startingBalance, setStartingBalance] = useState("");
  const [monthlyIncomeNet, setMonthlyIncomeNet] = useState("");
  const [wantCards, setWantCards] = useState(false);
  const [cards, setCards] = useState<CardRow[]>([
    { name: "", currentBalance: "", creditLimit: "" },
  ]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>(defaultExpenses);
  const [wantCushion, setWantCushion] = useState(true);
  const [goalTargetAmount, setGoalTargetAmount] = useState("3000");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const steps = useMemo(
    () => ["חשבון", "הכנסה", "כרטיסים", "קבועים", "כרית"],
    [],
  );

  const namedCards = useMemo(
    () =>
      wantCards
        ? cards
            .map((c, index) => ({ ...c, index, name: c.name.trim() }))
            .filter((c) => c.name.length > 0)
        : [],
    [cards, wantCards],
  );

  function updateExpense(index: number, patch: Partial<ExpenseRow>) {
    setExpenses((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function updateCard(index: number, patch: Partial<CardRow>) {
    setCards((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addCardRow() {
    setCards((prev) => [
      ...prev,
      { name: "", currentBalance: "", creditLimit: "" },
    ]);
  }

  function removeCardRow(index: number) {
    setCards((prev) => {
      if (prev.length <= 1) {
        return [{ name: "", currentBalance: "", creditLimit: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
    setExpenses((prev) =>
      prev.map((row) => {
        if (row.creditCardIndex == null) return row;
        if (row.creditCardIndex === index) {
          return { ...row, creditCardIndex: null };
        }
        if (row.creditCardIndex > index) {
          return { ...row, creditCardIndex: row.creditCardIndex - 1 };
        }
        return row;
      }),
    );
  }

  function goToFixedExpenses(opts?: { skipCards?: boolean }) {
    setError(null);
    if (opts?.skipCards || !wantCards) {
      setWantCards(false);
      setCards([{ name: "", currentBalance: "", creditLimit: "" }]);
      setExpenses((prev) =>
        prev.map((row) => ({ ...row, creditCardIndex: null })),
      );
      setStep(3);
      return;
    }
    const valid = cards.filter((c) => c.name.trim().length > 0);
    if (valid.length < 1) {
      setError("הוסיפו שם לכרטיס אחד לפחות — או בחרו «לא / אחר כך»");
      return;
    }
    setStep(3);
  }

  function goToCushion() {
    setError(null);
    const hasAmount = expenses.some((row) => Number(row.amount) > 0);
    if (!hasAmount) {
      setError("מלאו לפחות סכום אחד של הוצאה קבועה — זה עוזר לבנות תמונה");
      return;
    }
    setStep(4);
  }

  async function finish(opts?: { skipCushion?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const creditCardsPayload =
        wantCards
          ? cards
              .filter((c) => c.name.trim().length > 0)
              .map((c) => {
                const row: {
                  name: string;
                  currentBalance?: number;
                  creditLimit?: number;
                } = { name: c.name.trim() };
                const bal = Number(c.currentBalance);
                const lim = Number(c.creditLimit);
                if (Number.isFinite(bal) && bal > 0) row.currentBalance = bal;
                if (Number.isFinite(lim) && lim > 0) row.creditLimit = lim;
                return row;
              })
          : [];

      // Map original card indices → payload indices (skipped empty names).
      const indexMap = new Map<number, number>();
      if (wantCards) {
        let payloadIdx = 0;
        cards.forEach((c, origIdx) => {
          if (c.name.trim().length > 0) {
            indexMap.set(origIdx, payloadIdx);
            payloadIdx += 1;
          }
        });
      }

      const fixedExpenses = expenses
        .map((row) => {
          const amount = Number(row.amount) || 0;
          const mappedIdx =
            row.creditCardIndex != null
              ? indexMap.get(row.creditCardIndex)
              : undefined;
          const viaCard =
            creditCardsPayload.length > 0 &&
            mappedIdx != null &&
            mappedIdx >= 0;
          return {
            label: row.label,
            categoryKey: row.categoryKey,
            amount,
            ...(viaCard
              ? {
                  payVia: "CREDIT_CARD" as const,
                  creditCardIndex: mappedIdx,
                }
              : { payVia: "ACCOUNT" as const }),
          };
        })
        .filter((row) => row.amount > 0);

      if (fixedExpenses.length < 1) {
        throw new Error(
          "מלאו לפחות סכום אחד של הוצאה קבועה — זה עוזר לבנות תמונה",
        );
      }

      const skip = opts?.skipCushion || !wantCushion;
      const body: Record<string, unknown> = {
        accountName,
        startingBalance: Number(startingBalance) || 0,
        monthlyIncomeNet: Number(monthlyIncomeNet) || 0,
        fixedExpenses,
      };
      if (creditCardsPayload.length > 0) {
        body.creditCards = creditCardsPayload;
      }
      if (!skip) {
        body.goalTitle = "רזרבה להפתעות";
        body.goalTargetAmount = Math.max(1, Number(goalTargetAmount) || 3000);
        body.goalCurrentAmount = 0;
      }

      await api("/auth/onboarding/complete", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Full reload so app layout re-fetches me.onboardingCompleted=true
      // (same layout instance would otherwise bounce back to onboarding).
      window.location.assign("/app");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "משהו לא הסתדר — נסו שוב בעוד רגע",
      );
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void finish({ skipCushion: false });
  }

  const meta = stepMeta[step];

  return (
    <div className="onboard-shell">
      <header className="onboard-hero">
        <p className="onboard-kicker">ברוכים הבאים · בלי לחץ</p>
        <h1>{meta.title}</h1>
        <p className="muted onboard-blurb">{meta.blurb}</p>
        <div className="step-pills" aria-label="התקדמות בהקמה">
          {steps.map((label, i) => (
            <span
              key={label}
              className={`step-pill${i === step ? " active" : ""}${
                i < step ? " done" : ""
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </header>

      <form className="onboard-panel" onSubmit={onSubmit}>
        {step === 0 && (
          <>
            <label className="field">
              <span>כמה יש בעו״ש עכשיו?</span>
              <input
                type="number"
                step="1"
                inputMode="decimal"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="למשל 4,500 או ‎-800"
                required
                autoFocus
              />
              <span className="field-hint">
                אפשר גם מספר שלילי אם העו״ש במינוס — זה בסדר גמור.
              </span>
            </label>
            <button className="btn" type="button" onClick={() => setStep(1)}>
              המשך
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <label className="field">
              <span>כמה נכנס בחודש (נטו)</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={monthlyIncomeNet}
                onChange={(e) => setMonthlyIncomeNet(e.target.value)}
                placeholder="מה שנכנס בדרך כלל"
                required
                autoFocus
              />
              <span className="field-hint">
                אחרי מסים וניכויים — מה שבאמת מגיע אליכם.
              </span>
            </label>
            <div className="onboard-nav">
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
            <fieldset className="onboard-choice">
              <legend>יש כרטיס אשראי?</legend>
              <label className="onboard-choice-row">
                <input
                  type="radio"
                  name="cards"
                  checked={wantCards}
                  onChange={() => {
                    setWantCards(true);
                    setError(null);
                  }}
                />
                <span>
                  כן, נוסיף בקצרה
                  <span className="field-hint">שם מספיק — יתרה ומסגרת אופציונליים</span>
                </span>
              </label>
              <label className="onboard-choice-row">
                <input
                  type="radio"
                  name="cards"
                  checked={!wantCards}
                  onChange={() => {
                    setWantCards(false);
                    setError(null);
                  }}
                />
                <span>
                  לא / אחר כך
                  <span className="field-hint">
                    אפשר להוסיף אחרי הכניסה באשראי והלוואות
                  </span>
                </span>
              </label>
            </fieldset>

            {wantCards && (
              <div className="onboard-cards">
                {cards.map((card, index) => (
                  <div className="onboard-card-row" key={index}>
                    <label className="field">
                      <span>שם לכרטיס</span>
                      <input
                        value={card.name}
                        onChange={(e) =>
                          updateCard(index, { name: e.target.value })
                        }
                        placeholder="למשל כאל / ויזה"
                        autoFocus={index === 0}
                      />
                    </label>
                    <div className="onboard-card-grid">
                      <label className="field">
                        <span>יתרה במחזור (אופציונלי)</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="decimal"
                          value={card.currentBalance}
                          onChange={(e) =>
                            updateCard(index, {
                              currentBalance: e.target.value,
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                      <label className="field">
                        <span>מסגרת (אופציונלי)</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="decimal"
                          value={card.creditLimit}
                          onChange={(e) =>
                            updateCard(index, { creditLimit: e.target.value })
                          }
                          placeholder="—"
                        />
                      </label>
                    </div>
                    {cards.length > 1 && (
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() => removeCardRow(index)}
                      >
                        הסר כרטיס
                      </button>
                    )}
                  </div>
                ))}
                {cards.length < 4 && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={addCardRow}
                  >
                    + כרטיס נוסף
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="onboard-nav">
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
              >
                חזרה
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => goToFixedExpenses()}
              >
                המשך
              </button>
            </div>
            {wantCards && (
              <button
                type="button"
                className="btn quiet onboard-skip"
                onClick={() => goToFixedExpenses({ skipCards: true })}
              >
                לא / אחר כך — בלי כרטיסים עכשיו
              </button>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {expenses.map((row, index) => (
              <div className="onboard-expense-block" key={row.categoryKey + index}>
                <label className="field">
                  <span>{row.label}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    placeholder="0"
                    value={row.amount}
                    onChange={(e) =>
                      updateExpense(index, { amount: e.target.value })
                    }
                  />
                  <span className="field-hint">{row.hint}</span>
                </label>
                {namedCards.length > 0 && (
                  <label className="field">
                    <span>משולם מכרטיס?</span>
                    <select
                      value={
                        row.creditCardIndex == null
                          ? ""
                          : String(row.creditCardIndex)
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        updateExpense(index, {
                          creditCardIndex: v === "" ? null : Number(v),
                        });
                      }}
                    >
                      <option value="">מהחשבון (ברירת מחדל)</option>
                      {namedCards.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      רק אם ההוצאה יורדת מהאשראי כל חודש
                    </span>
                  </label>
                )}
              </div>
            ))}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="onboard-nav">
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
              >
                חזרה
              </button>
              <button className="btn" type="button" onClick={goToCushion}>
                המשך
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="onboard-summary" aria-label="סיכום קצר">
              <span>
                בחשבון <strong>{startingBalance || "0"} ₪</strong>
              </span>
              <span>
                נכנס בחודש <strong>{monthlyIncomeNet || "0"} ₪</strong>
              </span>
              {namedCards.length > 0 && (
                <span>
                  כרטיסים{" "}
                  <strong>
                    {namedCards.map((c) => c.name).join(", ")}
                  </strong>
                </span>
              )}
            </div>

            <fieldset className="onboard-choice">
              <legend>כרית להפתעות</legend>
              <label className="onboard-choice-row">
                <input
                  type="radio"
                  name="cushion"
                  checked={wantCushion}
                  onChange={() => setWantCushion(true)}
                />
                <span>
                  כן, נתחיל בקטן
                  <span className="field-hint">
                    אפשר לשנות אחר כך ביעדים
                  </span>
                </span>
              </label>
              <label className="onboard-choice-row">
                <input
                  type="radio"
                  name="cushion"
                  checked={!wantCushion}
                  onChange={() => setWantCushion(false)}
                />
                <span>
                  לא עכשיו
                  <span className="field-hint">אפשר להוסיף מתי שתרצו</span>
                </span>
              </label>
            </fieldset>

            {wantCushion && (
              <label className="field">
                <span>סכום יעד לכרית (₪)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={goalTargetAmount}
                  onChange={(e) => setGoalTargetAmount(e.target.value)}
                  required={wantCushion}
                />
                <span className="field-hint">
                  הצעה נעימה להתחלה — לא התחייבות.
                </span>
              </label>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="onboard-nav">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setStep(3)}
              >
                חזרה
              </button>
              <button className="btn" disabled={loading} type="submit">
                {loading ? "רגע…" : "בואו נראה את התמונה"}
              </button>
            </div>
            {wantCushion && (
              <button
                type="button"
                className="btn quiet onboard-skip"
                disabled={loading}
                onClick={() => void finish({ skipCushion: true })}
              >
                לדלג על הכרית ולהיכנס
              </button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
