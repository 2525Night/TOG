"use client";

import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  EXPENSE_CATEGORIES,
  categoryLabelHe,
} from "@moneytail/shared";
import { api, formatIls, invalidateApiCache } from "@/lib/api";
import {
  PeriodBar,
  useSelectedMonth,
  appHref,
  labelMonthHe,
} from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { PageHero } from "@/components/PageHero";
import { ConfirmPanel } from "@/components/ConfirmPanel";
import { PageDock } from "@/components/PageDock";
import { useNotify } from "@/components/ToastProvider";

type Account = {
  id: string;
  name: string;
  kind: string;
  currentBalance: number | string;
};

type Tx = {
  id: string;
  direction: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number | string;
  categoryKey: string;
  description: string | null;
  note: string | null;
  bookedAt: string;
  sourceReference: string | null;
  accountId: string | null;
};

type TxList = {
  items: Tx[];
  hasMore: boolean;
};

type Filter = "all" | "out" | "in" | "today";
type AddMode = null | "choice" | "expense" | "atm" | "opening";
type CashView = "journal" | "atm" | "balance";

function parseCashView(raw: string | null): CashView {
  if (raw === "atm" || raw === "balance") return raw;
  return "journal";
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabelHe(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "היום";
  if (sameDay(d, yest)) return "אתמול";
  return d.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isToday(iso: string) {
  return dayKey(iso) === dayKey(new Date().toISOString());
}

function CashJournalInner() {
  const month = useSelectedMonth();
  const search = useSearchParams();
  const focusRef = search.get("ref");
  const formRef = useRef<HTMLDivElement | null>(null);
  const { notify } = useNotify();

  const [cash, setCash] = useState<Account | null>(null);
  const [items, setItems] = useState<Tx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<CashView>(() =>
    parseCashView(search.get("view")),
  );
  const [atmMore, setAtmMore] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [detail, setDetail] = useState<Tx | null>(null);
  const [confirmDel, setConfirmDel] = useState<Tx | null>(null);

  const [amount, setAmount] = useState("");
  const [categoryKey, setCategoryKey] = useState("food");
  const [description, setDescription] = useState("");
  const [bookedAt, setBookedAt] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const balance = cash ? Number(cash.currentBalance) : 0;

  async function refresh() {
    invalidateApiCache("/accounts");
    invalidateApiCache("/transactions");
    const account = await api<Account>("/accounts/cash/ensure", {
      method: "POST",
      body: "{}",
    });
    setCash(account);
    const list = await api<TxList>(
      `/transactions?accountId=${encodeURIComponent(account.id)}&month=${month}&limit=100`,
    );
    setItems(list.items || []);
  }

  useEffect(() => {
    setLoading(true);
    setBusy(true);
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"))
      .finally(() => {
        setBusy(false);
        setLoading(false);
      });
  }, [month]);

  useEffect(() => {
    if (!focusRef || !items.length) return;
    const hit = items.find((t) => t.sourceReference === focusRef);
    if (hit) setDetail(hit);
  }, [focusRef, items]);

  useEffect(() => {
    if (!addMode) return;
    setDetail(null);
    const t = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [addMode]);

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (filter === "out") return t.direction === "EXPENSE";
      if (filter === "in") return t.direction === "INCOME";
      if (filter === "today") return isToday(t.bookedAt);
      return true;
    });
  }, [items, filter]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const t of filtered) {
      const k = dayKey(t.bookedAt);
      const list = map.get(k) || [];
      list.push(t);
      map.set(k, list);
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      label: dayLabelHe(rows[0].bookedAt),
      items: rows,
    }));
  }, [filtered]);

  const todayOut = useMemo(
    () =>
      items
        .filter((t) => t.direction === "EXPENSE" && isToday(t.bookedAt))
        .reduce((s, t) => s + Number(t.amount), 0),
    [items],
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      out: items.filter((t) => t.direction === "EXPENSE").length,
      in: items.filter((t) => t.direction === "INCOME").length,
      today: items.filter((t) => isToday(t.bookedAt)).length,
    }),
    [items],
  );

  function resetForm() {
    setAmount("");
    setCategoryKey("food");
    setDescription("");
    const d = new Date();
    setBookedAt(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }

  function openMode(mode: AddMode) {
    resetForm();
    setError(null);
    setConfirmDel(null);
    setAddMode(mode);
  }

  function goView(next: CashView) {
    setView(next);
    setConfirmDel(null);
    if (next === "atm") {
      setDetail(null);
      setAtmMore(false);
      openMode("atm");
      return;
    }
    setAtmMore(false);
    if (next === "balance") {
      if (addMode === "atm" || addMode === "choice" || addMode === "expense") {
        setAddMode(null);
      }
      return;
    }
    // journal
    if (addMode === "atm" || addMode === "opening") setAddMode(null);
    setDetail(null);
  }

  async function saveExpense(e: FormEvent) {
    e.preventDefault();
    if (!cash) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0.01) {
      setError("הזינו סכום תקין");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          direction: "EXPENSE",
          amount: n,
          categoryKey,
          description: description.trim() || undefined,
          accountId: cash.id,
          bookedAt: `${bookedAt}T12:00:00.000Z`,
        }),
      });
      resetForm();
      setAddMode(null);
      void notify({ kind: "SUCCESS", source: "CASH", titleHe: "מזומן", bodyHe: `נשמר ביומן · −${formatIls(n)} · יתרה עודכנה` });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function saveAtm(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0.01) {
      setError("הזינו סכום תקין");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/transactions/cash-atm-withdrawal", {
        method: "POST",
        body: JSON.stringify({
          amount: n,
          bookedAt: `${bookedAt}T12:00:00.000Z`,
          description: description.trim() || "משיכת מזומן · כספומט",
        }),
      });
      resetForm();
      setAddMode(null);
      setView("journal");
      void notify({ kind: "SUCCESS", source: "CASH", titleHe: "מזומן", bodyHe: `משיכה נרשמה · −${formatIls(n)} בעו״ש · +${formatIls(n)} בכיס` });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function saveOpening(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0.01) {
      setError("הזינו סכום תקין");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let account = cash;
      if (!account) {
        account = await api<Account>("/accounts/cash/ensure", {
          method: "POST",
          body: "{}",
        });
        setCash(account);
      }
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          direction: "INCOME",
          amount: n,
          categoryKey: "other",
          description: "יתרת פתיחה · מזומן בכיס",
          accountId: account.id,
          bookedAt: `${bookedAt}T12:00:00.000Z`,
        }),
      });
      resetForm();
      setAddMode(null);
      setView("journal");
      void notify({ kind: "SUCCESS", source: "CASH", titleHe: "מזומן", bodyHe: `יומן התחיל · יש לכם ${formatIls(n)} במזומן` });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function removeTx(tx: Tx) {
    setBusy(true);
    setError(null);
    try {
      await api(`/transactions/${tx.id}`, { method: "DELETE" });
      setConfirmDel(null);
      setDetail(null);
      void notify({ kind: "SUCCESS", source: "CASH", titleHe: "מזומן", bodyHe: "נמחק מהיומן · היתרה עודכנה" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  const hasPocketData = items.length > 0 || balance > 0.005;
  const empty = !loading && !busy && !hasPocketData;
  const bootLoading = loading && !hasPocketData;
  const filterLabel =
    filter === "out"
      ? "הוצאות מהכיס"
      : filter === "in"
        ? "משיכות לכיס"
        : filter === "today"
          ? "רשומות מהיום"
          : "כל רשומות הכיס";
  const clarityAnswer =
    balance <= 0.005 && items.length === 0
      ? "עדיין אין מזומן ביומן"
      : `יש לכם ${formatIls(balance)} במזומן`;

  return (
    <div
      className="grid money-hub has-page-dock"
      style={{ gap: "0.85rem" }}
      data-testid="cash-journal"
    >
      <PageHeader
        title={view === "atm" ? "משיכה לכיס" : "מעקב מזומן"}
        subtitle={
          view === "atm"
            ? `מעו״ש → מזומן · עכשיו בכיס ${bootLoading ? "…" : formatIls(balance)}`
            : undefined
        }
        kicker={view === "atm" ? undefined : "כיס"}
      />

      {view !== "atm" ? (
        <>
          <PageHero
            kicker={
              view === "balance"
                ? "יתרה · מזומן בכיס"
                : "מעקב מזומן · יומן"
            }
            amount={
              <span data-testid="cash-balance-hero">
                {bootLoading
                  ? "…"
                  : balance.toLocaleString("he-IL", {
                      maximumFractionDigits:
                        Math.abs(balance) > 0 && Math.abs(balance) < 1 ? 2 : 0,
                    })}
              </span>
            }
            unit="₪ · בכיס עכשיו · לא יתרת עו״ש"
            answer={
              <span data-testid="cash-clarity-meaning">
                {bootLoading
                  ? "טוענים את יומן הכיס…"
                  : empty
                    ? "נקודת התחלה קצרה — כמה יש בכיס, בלי לערבב עם העו״ש"
                    : todayOut > 0
                      ? `${clarityAnswer} · היום −${formatIls(todayOut)}`
                      : `${clarityAnswer} · רק כיס פיזי, נפרד מהעו״ש`}
              </span>
            }
            negative={balance < 0}
            aria-label="תשובת מזומן"
            data-testid="cash-clarity"
          />

          <PeriodBar
            extra={
              <span className="muted" data-testid="cash-not-checking">
                לא יתרת עו״ש
              </span>
            }
          />
        </>
      ) : null}

      {error ? (
        <p className="error" role="alert" data-testid="cash-error">
          {error}
        </p>
      ) : null}
      

      {view !== "atm" && bootLoading ? (
        <section className="card" aria-busy="true" data-testid="cash-loading">
          <p className="muted" style={{ margin: 0 }}>
            טוענים יומן מזומן…
          </p>
        </section>
      ) : null}

      {view === "journal" && hasPocketData ? (
        <div
          className="dir-chips"
          role="tablist"
          aria-label="סינון יומן מזומן"
          data-testid="cash-chips"
        >
          {(
            [
              ["all", "הכל", counts.all],
              ["out", "הוצאות", counts.out],
              ["in", "משיכות לכיס", counts.in],
              ["today", "היום", counts.today],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`dir-chip${filter === key ? " active" : ""}${
                key === "out" ? " expense" : key === "in" ? " income" : ""
              }`}
              aria-pressed={filter === key}
              aria-selected={filter === key}
              data-active={filter === key ? "true" : "false"}
              data-testid={`cash-chip-${key}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="dir-chip-count">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {view === "journal" && hasPocketData ? (
        <p
          className="muted"
          style={{ margin: 0, fontSize: "0.85rem" }}
          role="status"
          data-testid="cash-filter-status"
        >
          מציגים: {filterLabel}
          {filter !== "all" ? ` · ${filtered.length} מתוך ${items.length}` : ""}
        </p>
      ) : null}

      {view === "journal" && empty && !loading ? (
        <section
          className="card"
          aria-label="התחלת יומן מזומן"
          data-testid="cash-empty"
        >
          <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
            עדיין אין יומן מזומן
          </h2>
          <p className="muted">
            זה ארנק הכיס שלכם — נפרד מהעו״ש. התחילו ביתרת פתיחה, או רשמו משיכה
            מהבנק שתיכנס לכיס.
          </p>
          <div
            className="tx-add-actions"
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="btn"
              data-testid="cash-cta-opening"
              onClick={() => {
                goView("balance");
                openMode("opening");
              }}
            >
              הגדר יתרת פתיחה
            </button>
            <button
              type="button"
              className="btn secondary"
              data-testid="cash-cta-atm"
              onClick={() => goView("atm")}
            >
              משיכה מעו״ש לכיס
            </button>
          </div>
        </section>
      ) : null}

      {view === "journal" && hasPocketData ? (
        <>
          <div
            className="tx-add-actions"
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="btn"
              data-testid="cash-cta-add"
              onClick={() => openMode("choice")}
            >
              + תעד ביומן
            </button>
            <Link
              className="btn secondary"
              href={appHref("/app/money", month)}
              data-testid="cash-link-money"
            >
              לתנועות עו״ש
            </Link>
          </div>

          <section
            className="card"
            aria-label="יומן מזומן"
            data-testid="cash-journal-list"
          >
            {dayGroups.length === 0 ? (
              <p className="muted" style={{ margin: 0 }} data-testid="cash-filter-empty">
                אין רשומות במסנן הנוכחי לחודש זה — נסו «הכל».
              </p>
            ) : (
              dayGroups.map((g) => (
                <div key={g.key} style={{ marginBottom: "0.85rem" }}>
                  <div className="debts-totals-eyebrow">{g.label}</div>
                  <ul
                    className="tx-list"
                    style={{
                      listStyle: "none",
                      margin: "0.35rem 0 0",
                      padding: 0,
                    }}
                  >
                    {g.items.map((t) => {
                      const out = t.direction === "EXPENSE";
                      const title =
                        t.description?.trim() ||
                        categoryLabelHe(t.categoryKey);
                      const linked = Boolean(
                        t.sourceReference?.startsWith("cash-atm:"),
                      );
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="tx-row"
                            data-testid={`cash-row-${t.id}`}
                            style={{
                              width: "100%",
                              textAlign: "right",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              minHeight: 48,
                              padding: "0.65rem 0.15rem",
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: "0.5rem",
                              alignItems: "center",
                              borderBottom:
                                "1px solid color-mix(in srgb, var(--mt-line, #2a3441) 18%, transparent)",
                            }}
                            onClick={() => {
                              setAddMode(null);
                              setDetail(t);
                              setView("balance");
                            }}
                          >
                            <span>
                              <strong style={{ display: "block" }}>{title}</strong>
                              <span
                                className="muted"
                                style={{ fontSize: "0.8rem" }}
                              >
                                {categoryLabelHe(t.categoryKey)}
                                {linked ? " · מקושר לתנועות עו״ש" : ""}
                              </span>
                            </span>
                            <strong className={out ? "tx-out" : "tx-in"}>
                              {out ? "−" : "+"}
                              {formatIls(Number(t.amount))}
                            </strong>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}

      {view === "journal" && addMode === "choice" ? (
        <div ref={formRef}>
        <section
          className="card"
          aria-label="בחירת תיעוד"
          data-testid="cash-choice"
        >
          <h3 style={{ marginTop: 0 }}>מה לתעד?</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            בחרו סוג אחד — נמלא סכום קצר ונחזור ליומן.
          </p>
          <div
            style={{
              display: "grid",
              gap: "0.5rem",
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <button
              type="button"
              className="btn"
              data-testid="cash-choice-expense"
              onClick={() => setAddMode("expense")}
            >
              − הוצאה מהכיס
            </button>
            <button
              type="button"
              className="btn secondary"
              data-testid="cash-choice-atm"
              onClick={() => goView("atm")}
            >
              + משיכה לכיס
            </button>
          </div>
          <button
            type="button"
            className="btn secondary"
            style={{ marginTop: "0.55rem", width: "100%" }}
            onClick={() => setAddMode(null)}
          >
            ביטול
          </button>
        </section>
        </div>
      ) : null}

      {view === "journal" && addMode === "expense" ? (
        <div ref={formRef}>
        <form
          className="card"
          onSubmit={saveExpense}
          aria-label="הוצאת מזומן"
          data-testid="cash-form-expense"
        >
          <h3 style={{ marginTop: 0 }}>הוצאת מזומן</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            יורד מהכיס בלבד — העו״ש לא משתנה.
          </p>
          <label>
            סכום
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              inputMode="decimal"
              value={amount}
              data-testid="cash-amount"
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            קטגוריה
            <select
              value={categoryKey}
              data-testid="cash-category"
              onChange={(e) => setCategoryKey(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.labelHe}
                </option>
              ))}
            </select>
          </label>
          <label>
            תיאור (אופציונלי)
            <input
              type="text"
              value={description}
              data-testid="cash-description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="למשל: קפה"
            />
          </label>
          <label>
            תאריך
            <input
              type="date"
              required
              value={bookedAt}
              onChange={(e) => setBookedAt(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="submit"
              className="btn"
              disabled={busy}
              data-testid="cash-save-expense"
            >
              שמור ביומן
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setAddMode(null)}
            >
              ביטול
            </button>
          </div>
        </form>
        </div>
      ) : null}

      {view === "atm" ? (
        <div ref={formRef} className="cash-atm-shell">
          <form
            className="cash-atm-panel"
            onSubmit={saveAtm}
            aria-label="משיכת מזומן"
            data-testid="cash-form-atm"
          >
            <p className="cash-atm-explain" data-testid="cash-atm-explain">
              − בעו״ש · + בכיס · בלי כפילות בהוצאות
            </p>

            <label className="cash-atm-amount field">
              <span className="cash-atm-amount-label">סכום למשיכה</span>
              <div className="cash-atm-amount-wrap">
                <span className="cash-atm-currency" aria-hidden>
                  ₪
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  inputMode="decimal"
                  autoFocus
                  value={amount}
                  data-testid="cash-amount"
                  placeholder="0"
                  aria-label="סכום בשקלים"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </label>

            <label className="field cash-atm-date">
              <span>תאריך</span>
              <input
                type="date"
                required
                value={bookedAt}
                onChange={(e) => setBookedAt(e.target.value)}
              />
            </label>

            {!atmMore ? (
              <button
                type="button"
                className="linkish cash-atm-more-toggle"
                onClick={() => setAtmMore(true)}
              >
                פרטים נוספים
              </button>
            ) : (
              <label className="field">
                <span>תיאור (אופציונלי)</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="משיכת מזומן · כספומט"
                />
              </label>
            )}

            <button
              type="submit"
              className="btn cash-atm-submit"
              disabled={busy}
              data-testid="cash-save-atm"
            >
              רשום משיכה
            </button>
          </form>
        </div>
      ) : null}

      {view === "balance" ? (
        <>
          {!detail && !confirmDel && addMode !== "opening" ? (
            <section className="card" aria-label="יתרה ופרטים">
              <h3 style={{ marginTop: 0 }}>יתרה ופרטים</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                יתרת הכיס מוצגת למעלה. אפשר להגדיר יתרת פתיחה, או לבחור רשומה
                מהיומן כדי לראות פרטים.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  data-testid="cash-cta-opening"
                  onClick={() => openMode("opening")}
                >
                  {empty ? "הגדר יתרת פתיחה" : "עדכון יתרת פתיחה"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => goView("journal")}
                >
                  ליומן
                </button>
              </div>
            </section>
          ) : null}

          {addMode === "opening" ? (
            <div ref={formRef}>
            <form
              className="card"
              onSubmit={saveOpening}
              aria-label="יתרת פתיחה"
              data-testid="cash-form-opening"
            >
              <h3 style={{ marginTop: 0 }}>יתרת פתיחה</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                כמה יש לכם בכיס עכשיו? זה נקודת ההתחלה ליומן.
              </p>
              <label>
                סכום
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  inputMode="decimal"
                  value={amount}
                  data-testid="cash-amount"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                תאריך
                <input
                  type="date"
                  required
                  value={bookedAt}
                  onChange={(e) => setBookedAt(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={busy}
                  data-testid="cash-save-opening"
                >
                  התחל יומן
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setAddMode(null);
                    if (empty) goView("journal");
                  }}
                >
                  ביטול
                </button>
              </div>
            </form>
            </div>
          ) : null}

          {detail && !confirmDel ? (
            <section
              className="card"
              aria-label="פרטי רשומה"
              data-testid="cash-detail"
            >
              <h3 style={{ marginTop: 0 }}>
                {detail.description?.trim() ||
                  categoryLabelHe(detail.categoryKey)}
              </h3>
              <p className="muted" style={{ marginTop: 0 }}>
                {new Date(detail.bookedAt).toLocaleString("he-IL")} ·{" "}
                {categoryLabelHe(detail.categoryKey)}
              </p>
              <p
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  margin: "0.35rem 0",
                }}
                data-testid="cash-detail-amount"
              >
                <span
                  className={
                    detail.direction === "EXPENSE" ? "tx-out" : "tx-in"
                  }
                >
                  {detail.direction === "EXPENSE" ? "−" : "+"}
                  {formatIls(Number(detail.amount))}
                </span>
              </p>
              {detail.sourceReference?.startsWith("cash-atm:") ? (
                <Link
                  className="btn secondary"
                  href={appHref("/app/money", month)}
                  style={{ marginBottom: "0.55rem" }}
                  data-testid="cash-detail-money-link"
                >
                  פתח בתנועות (עו״ש)
                </Link>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn secondary"
                  data-testid="cash-detail-delete"
                  onClick={() => setConfirmDel(detail)}
                >
                  מחיקה
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="cash-detail-close"
                  onClick={() => {
                    setDetail(null);
                    goView("journal");
                  }}
                >
                  חזרה ליומן
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {confirmDel ? (
        <div data-testid="cash-confirm-delete">
          <ConfirmPanel
            title="למחוק מהיומן?"
            message={`יימחק ${formatIls(Number(confirmDel.amount))} והיתרה תתעדכן. אפשר לבטל.`}
            confirmLabel="מחק"
            danger
            busy={busy}
            onCancel={() => setConfirmDel(null)}
            onConfirm={() => removeTx(confirmDel)}
          />
        </div>
      ) : null}

      <PageDock
        ariaLabel="מצבי מזומן"
        value={view}
        onChange={(id) => goView(id as CashView)}
        items={[
          { id: "journal", label: "יומן" },
          { id: "atm", label: "משיכה" },
          { id: "balance", label: "יתרה" },
        ]}
      />
    </div>
  );
}

export default function CashPage() {
  return (
    <Suspense fallback={<p className="muted">טוען יומן מזומן…</p>}>
      <CashJournalInner />
    </Suspense>
  );
}
