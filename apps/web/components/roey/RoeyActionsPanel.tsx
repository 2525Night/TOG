"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@moneytail/shared";
import { api, formatIls } from "@/lib/api";

type ActionType =
  | "ADD_TRANSACTION"
  | "CREATE_COMMITMENT"
  | "CHANGE_TRANSACTION_CATEGORY"
  | "ALLOCATE_SURPLUS_TO_GOAL";

type ActionRow = {
  id: string;
  conversationId: string | null;
  type: ActionType;
  status:
    | "PENDING"
    | "APPROVED"
    | "EXECUTED"
    | "REJECTED"
    | "FAILED"
    | "EXPIRED";
  payload: Record<string, unknown>;
  preview: {
    titleHe: string;
    summaryHe: string;
    effectHe: string;
    alternativeHe: string | null;
    amountIls: number | null;
    availableBefore: number | null;
    availableAfter: number | null;
    severity: "INFO" | "WARNING" | "CRITICAL";
    requiresDoubleConfirm: boolean;
  };
  severity: "INFO" | "WARNING" | "CRITICAL";
  requiresDoubleConfirm: boolean;
  expiresAt: string;
  errorHe: string | null;
  createdAt: string;
};

type Tx = {
  id: string;
  amount: number | string;
  description: string | null;
  categoryKey: string;
  direction: "INCOME" | "EXPENSE" | "TRANSFER";
  bookedAt: string;
};

type Goal = {
  id: string;
  title: string;
  currentAmount: number | string;
  targetAmount: number | string;
};

type Props = {
  month: string;
  conversationId: string | null;
  onExecuted?: () => void;
};

const ACTION_LABELS: Record<ActionType, string> = {
  ADD_TRANSACTION: "הוספת תנועה",
  CREATE_COMMITMENT: "יצירת התחייבות",
  CHANGE_TRANSACTION_CATEGORY: "שינוי קטגוריה",
  ALLOCATE_SURPLUS_TO_GOAL: "הקצאה ליעד",
};

export function RoeyActionsPanel({
  month,
  conversationId,
  onExecuted,
}: Props) {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [type, setType] = useState<ActionType>("ADD_TRANSACTION");
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [categoryKey, setCategoryKey] = useState("food");
  const [description, setDescription] = useState("");
  const [bookedAt, setBookedAt] = useState(todayInput());
  const [titleHe, setTitleHe] = useState("");
  const [cadence, setCadence] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [transactionId, setTransactionId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [confirmationPhrases, setConfirmationPhrases] = useState<
    Record<string, string>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const categories = useMemo(
    () => (direction === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
    [direction],
  );

  const load = useCallback(async () => {
    try {
      const [nextActions, txResult, nextGoals] = await Promise.all([
        api<ActionRow[]>("/roey/actions"),
        api<{ items: Tx[] }>(
          `/transactions?month=${encodeURIComponent(month)}&limit=50`,
        ),
        api<Goal[]>(`/goals?month=${encodeURIComponent(month)}`),
      ]);
      setActions(nextActions);
      setTransactions(txResult.items);
      setGoals(nextGoals);
      setTransactionId((current) => current || txResult.items[0]?.id || "");
      setGoalId((current) => current || nextGoals[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לטעון פעולות");
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setCategoryKey(
      direction === "INCOME"
        ? INCOME_CATEGORIES[0].key
        : EXPENSE_CATEGORIES[0].key,
    );
  }, [direction]);

  useEffect(() => {
    if (type === "ADD_TRANSACTION") return;
    if (type === "CHANGE_TRANSACTION_CATEGORY") {
      const selected = transactions.find(
        (transaction) => transaction.id === transactionId,
      );
      setCategoryKey(
        selected?.direction === "INCOME"
          ? INCOME_CATEGORIES[0].key
          : EXPENSE_CATEGORIES[0].key,
      );
      return;
    }
    setCategoryKey(EXPENSE_CATEGORIES[0].key);
  }, [type, transactionId, transactions]);

  async function propose(event: FormEvent) {
    event.preventDefault();
    setBusy("propose");
    setError(null);
    setSuccess(null);
    try {
      const numericAmount = Number(amount);
      const payload =
        type === "ADD_TRANSACTION"
          ? {
              direction,
              amount: numericAmount,
              categoryKey,
              bookedAt,
              description: description.trim() || undefined,
            }
          : type === "CREATE_COMMITMENT"
            ? {
                titleHe: titleHe.trim(),
                categoryKey,
                expectedAmount: numericAmount,
                cadence,
              }
            : type === "CHANGE_TRANSACTION_CATEGORY"
              ? { transactionId, categoryKey }
              : { goalId, amount: numericAmount, month };
      const created = await api<ActionRow>("/roey/actions/propose", {
        method: "POST",
        body: JSON.stringify({
          type,
          payload,
          conversationId: conversationId || undefined,
        }),
      });
      setActions((current) => [created, ...current]);
      setSuccess("Roey הכין את הפעולה. בדקו את ההשפעה ואשרו רק אם הכול נכון.");
      setAmount("");
      setDescription("");
      setTitleHe("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "הכנת הפעולה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  async function approve(action: ActionRow) {
    setBusy(action.id);
    setError(null);
    try {
      const updated = await api<ActionRow>(
        `/roey/actions/${action.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            confirm: true,
            confirmationPhrase: action.requiresDoubleConfirm
              ? confirmationPhrases[action.id] || ""
              : undefined,
          }),
        },
      );
      replaceAction(updated);
      setSuccess("הפעולה בוצעה ונרשמה על ידי Roey.");
      await load();
      onExecuted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ביצוע הפעולה נכשל");
    } finally {
      setBusy(null);
    }
  }

  async function reject(action: ActionRow) {
    setBusy(action.id);
    setError(null);
    try {
      const updated = await api<ActionRow>(
        `/roey/actions/${action.id}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "המשתמש דחה את ההצעה" }),
        },
      );
      replaceAction(updated);
      setSuccess("ההצעה נדחתה ולא בוצע שינוי.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "דחיית ההצעה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  function replaceAction(updated: ActionRow) {
    setActions((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  return (
    <div className="roey-actions">
      <section className="card roey-action-builder">
        <span className="roey-eyebrow">פעולה חדשה</span>
        <h2>Roey מכין, אתם מאשרים</h2>
        <p className="muted">
          שום שינוי לא מתבצע לפני הצגת ההשפעה ואישור מפורש.
        </p>

        <form className="roey-settings-form" onSubmit={propose}>
          <label className="field">
            <span>סוג פעולה</span>
            <select
              name="actionType"
              value={type}
              onChange={(event) => setType(event.target.value as ActionType)}
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {type === "ADD_TRANSACTION" && (
            <>
              <label className="field">
                <span>כיוון</span>
                <select
                  name="direction"
                  value={direction}
                  onChange={(event) =>
                    setDirection(event.target.value as "INCOME" | "EXPENSE")
                  }
                >
                  <option value="EXPENSE">הוצאה</option>
                  <option value="INCOME">הכנסה</option>
                </select>
              </label>
              <MoneyField value={amount} onChange={setAmount} />
              <CategoryField
                value={categoryKey}
                onChange={setCategoryKey}
                categories={categories}
              />
              <label className="field">
                <span>תאריך</span>
                <input
                  name="bookedAt"
                  type="date"
                  value={bookedAt}
                  onChange={(event) => setBookedAt(event.target.value)}
                />
              </label>
              <label className="field">
                <span>תיאור</span>
                <input
                  name="description"
                  value={description}
                  maxLength={500}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </>
          )}

          {type === "CREATE_COMMITMENT" && (
            <>
              <label className="field">
                <span>שם ההתחייבות</span>
                <input
                  name="commitmentTitle"
                  value={titleHe}
                  required
                  maxLength={240}
                  onChange={(event) => setTitleHe(event.target.value)}
                />
              </label>
              <MoneyField value={amount} onChange={setAmount} />
              <CategoryField
                value={categoryKey}
                onChange={setCategoryKey}
                categories={
                  transactions.find(
                    (transaction) => transaction.id === transactionId,
                  )?.direction === "INCOME"
                    ? INCOME_CATEGORIES
                    : EXPENSE_CATEGORIES
                }
              />
              <label className="field">
                <span>תדירות</span>
                <select
                  name="cadence"
                  value={cadence}
                  onChange={(event) =>
                    setCadence(event.target.value as "MONTHLY" | "YEARLY")
                  }
                >
                  <option value="MONTHLY">חודשית</option>
                  <option value="YEARLY">שנתית</option>
                </select>
              </label>
            </>
          )}

          {type === "CHANGE_TRANSACTION_CATEGORY" && (
            <>
              <label className="field">
                <span>תנועה</span>
                <select
                  name="transactionId"
                  value={transactionId}
                  required
                  onChange={(event) => setTransactionId(event.target.value)}
                >
                  {transactions.map((transaction) => (
                    <option key={transaction.id} value={transaction.id}>
                      {transaction.description || "תנועה"} ·{" "}
                      {formatIls(Number(transaction.amount))}
                    </option>
                  ))}
                </select>
              </label>
              <CategoryField
                value={categoryKey}
                onChange={setCategoryKey}
                categories={EXPENSE_CATEGORIES}
              />
              {transactions.length === 0 && (
                <p className="field-hint">אין תנועות בחודש שנבחר.</p>
              )}
            </>
          )}

          {type === "ALLOCATE_SURPLUS_TO_GOAL" && (
            <>
              <label className="field">
                <span>יעד</span>
                <select
                  name="goalId"
                  value={goalId}
                  required
                  onChange={(event) => setGoalId(event.target.value)}
                >
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </label>
              <MoneyField value={amount} onChange={setAmount} />
              {goals.length === 0 && (
                <p className="field-hint">צריך ליצור יעד לפני הקצאת עודף.</p>
              )}
            </>
          )}

          <button
            className="btn"
            type="submit"
            disabled={
              busy != null ||
              ((type === "ADD_TRANSACTION" ||
                type === "CREATE_COMMITMENT" ||
                type === "ALLOCATE_SURPLUS_TO_GOAL") &&
                !(Number(amount) > 0)) ||
              (type === "CHANGE_TRANSACTION_CATEGORY" && !transactionId) ||
              (type === "ALLOCATE_SURPLUS_TO_GOAL" && !goalId)
            }
          >
            {busy === "propose" ? "מחשב השפעה…" : "הכנת פעולה לבדיקה"}
          </button>
        </form>
      </section>

      <section className="roey-action-list">
        <div className="roey-action-list-head">
          <div>
            <span className="roey-eyebrow">הצעות אחרונות</span>
            <h2>ממתינות לאישור</h2>
          </div>
          <button className="btn quiet" type="button" onClick={() => void load()}>
            רענון
          </button>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-success" role="status">{success}</p>}
        {actions.length === 0 && (
          <div className="card">
            <p className="muted">עדיין אין הצעות פעולה.</p>
          </div>
        )}
        {actions.map((action) => (
          <article
            className={`card roey-action-card ${action.severity.toLowerCase()}`}
            key={action.id}
          >
            <div className="roey-action-card-head">
              <div>
                <span className="roey-action-status">
                  {statusHe(action.status)}
                </span>
                <h3>{action.preview.titleHe}</h3>
              </div>
              <span className={`roey-severity ${action.severity.toLowerCase()}`}>
                {severityHe(action.severity)}
              </span>
            </div>
            <strong>{action.preview.summaryHe}</strong>
            <small className="roey-action-expiry">
              {action.status === "PENDING"
                ? `בתוקף עד ${new Date(action.expiresAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
                : statusHe(action.status)}
            </small>
            <p>{action.preview.effectHe}</p>
            {action.preview.availableBefore != null &&
              action.preview.availableAfter != null && (
                <div className="roey-action-impact">
                  <span>
                    לפני <strong>{formatIls(action.preview.availableBefore)}</strong>
                  </span>
                  <span aria-hidden="true">←</span>
                  <span>
                    אחרי{" "}
                    <strong
                      className={
                        action.preview.availableAfter < 0 ? "negative" : ""
                      }
                    >
                      {formatIls(action.preview.availableAfter)}
                    </strong>
                  </span>
                </div>
              )}
            {action.preview.alternativeHe && (
              <p className="roey-action-alternative">
                חלופה בטוחה יותר: {action.preview.alternativeHe}
              </p>
            )}
            {action.status === "PENDING" && (
              <div className="roey-action-controls">
                {action.requiresDoubleConfirm && (
                  <label className="field">
                    <span>לאישור הקלידו: אני מאשר את ההשפעה</span>
                    <input
                      name={`confirmation-${action.id}`}
                      value={confirmationPhrases[action.id] || ""}
                      onChange={(event) =>
                        setConfirmationPhrases((current) => ({
                          ...current,
                          [action.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}
                <div>
                  <button
                    className={
                      action.severity === "CRITICAL" ? "btn danger" : "btn"
                    }
                    type="button"
                    disabled={
                      busy != null ||
                      new Date(action.expiresAt).getTime() <= Date.now() ||
                      (action.requiresDoubleConfirm &&
                        confirmationPhrases[action.id]?.trim() !==
                          "אני מאשר את ההשפעה")
                    }
                    onClick={() => void approve(action)}
                  >
                    {busy === action.id ? "מבצע…" : "אישור וביצוע"}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy != null}
                    onClick={() => void reject(action)}
                  >
                    דחייה
                  </button>
                </div>
              </div>
            )}
            {action.errorHe && <p className="form-error">{action.errorHe}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}

function MoneyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>סכום</span>
      <input
        name="amount"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CategoryField({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: readonly { key: string; labelHe: string }[];
}) {
  return (
    <label className="field">
      <span>קטגוריה</span>
      <select
        name="categoryKey"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {categories.map((category) => (
          <option key={category.key} value={category.key}>
            {category.labelHe}
          </option>
        ))}
      </select>
    </label>
  );
}

function severityHe(value: ActionRow["severity"]) {
  if (value === "CRITICAL") return "סיכון גבוה";
  if (value === "WARNING") return "דורש תשומת לב";
  return "השפעה רגילה";
}

function statusHe(value: ActionRow["status"]) {
  if (value === "PENDING") return "ממתין לאישור";
  if (value === "EXECUTED") return "בוצע";
  if (value === "REJECTED") return "נדחה";
  if (value === "FAILED") return "נכשל";
  if (value === "EXPIRED") return "פג תוקף";
  return "אושר";
}

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
