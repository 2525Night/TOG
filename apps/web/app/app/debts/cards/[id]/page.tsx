"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  EXPENSE_CATEGORIES,
  mergeCategoryOptions,
} from "@moneytail/shared";
import { api, formatIls } from "@/lib/api";
import {
  PeriodBar,
  useSelectedMonth,
  appHref,
  labelMonthHe,
} from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { DebtsSubNav } from "@/components/DebtsSubNav";
import { DebtSplitMeter } from "@/components/DebtSplitMeter";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ConfirmPanel } from "@/components/ConfirmPanel";

type ScheduleSlot = {
  month: string;
  index: number;
  status: "paid" | "due" | "upcoming";
  amount: number;
};

type Plan = {
  id: string;
  titleHe: string;
  originalAmount: number;
  installmentCount: number;
  installmentAmount: number;
  chargedCount: number;
  remainingCount: number;
  remainingAmount: number;
  startMonth: string;
  schedule?: ScheduleSlot[];
};

type CardDetail = {
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
  billingDay?: number | null;
  installmentCommitment: number;
  monthlyInstallments: number;
  focusMonth?: string;
  installmentPlans: Plan[];
  transactions: Array<{
    id: string;
    amount: number;
    description: string | null;
    economicRole: string;
    installmentPlanId: string | null;
    bookedAt: string;
  }>;
};

type UserCat = {
  key: string;
  labelHe: string;
  direction: "INCOME" | "EXPENSE";
  nature?: "fixed" | "variable" | "periodic";
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL");
}

function defaultBookedDate(month: string) {
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (month === nowKey) {
    return `${month}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${month}-01`;
}

function shortMonthHe(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [, m] = ym.split("-");
  return m;
}

function CardDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = String(params.id || "");
  const month = useSelectedMonth();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [openPlan, setOpenPlan] = useState(false);
  const [openCharge, setOpenCharge] = useState(
    () => searchParams.get("charge") === "1",
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState("");
  const [limit, setLimit] = useState("");
  const [billing, setBilling] = useState("");
  const [billingDay, setBillingDay] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planOriginal, setPlanOriginal] = useState("");
  const [planCount, setPlanCount] = useState("12");
  const [planCharged, setPlanCharged] = useState("0");
  const [planStart, setPlanStart] = useState(month);
  const [userCats, setUserCats] = useState<UserCat[]>([]);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeCategory, setChargeCategory] = useState<string>(
    EXPENSE_CATEGORIES[0]?.key || "food",
  );
  const [chargeDate, setChargeDate] = useState(defaultBookedDate(month));
  const [chargeInstallments, setChargeInstallments] = useState("1");
  /** once = קנייה · installments = פריסה · standing = הוראת קבע חודשית בכרטיס */
  const [chargeMode, setChargeMode] = useState<
    "once" | "installments" | "standing"
  >(() => (searchParams.get("standing") === "1" ? "standing" : "once"));
  const [chargeFeedback, setChargeFeedback] = useState<string | null>(null);
  const [cardStandings, setCardStandings] = useState<
    Array<{
      id: string;
      titleHe: string;
      expectedAmount: number | string;
      categoryKey: string;
      startMonth: string | null;
      payVia: string;
      creditCardId: string | null;
    }>
  >([]);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { kind: "remove-card" }
    | { kind: "delete-plan"; plan: Plan }
    | { kind: "delete-tx"; tx: CardDetail["transactions"][number] }
    | { kind: "deactivate-standing"; id: string; titleHe: string }
    | null
  >(null);

  const expenseCats = useMemo(
    () =>
      mergeCategoryOptions(
        EXPENSE_CATEGORIES,
        userCats.filter((c) => c.direction === "EXPENSE"),
      ),
    [userCats],
  );

  const installmentN =
    chargeMode === "installments"
      ? Math.max(2, Math.floor(Number(chargeInstallments) || 2))
      : 1;
  const chargeTotal = Number(chargeAmount);
  const monthlyPreview =
    Number.isFinite(chargeTotal) &&
    chargeTotal > 0 &&
    chargeMode === "installments" &&
    installmentN >= 2
      ? Math.round((chargeTotal / installmentN) * 100) / 100
      : null;

  const duePlanCount = useMemo(() => {
    if (!card) return 0;
    return card.installmentPlans.filter((p) =>
      (p.schedule || []).some((s) => s.status === "due"),
    ).length;
  }, [card]);

  async function load() {
    const res = await api<CardDetail>(
      `/credit-cards/${id}?month=${encodeURIComponent(month)}`,
    );
    setCard(res);
    setBalance(String(res.currentBalance));
    setLimit(String(res.creditLimit));
    setBilling(res.nextBillingDate ? res.nextBillingDate.slice(0, 10) : "");
    setBillingDay(
      res.billingDay != null && res.billingDay >= 1 ? String(res.billingDay) : "",
    );
  }

  useEffect(() => {
    if (searchParams.get("charge") === "1" || searchParams.get("standing") === "1") {
      setOpenCharge(true);
      setOpenPlan(false);
      setEditing(false);
      if (searchParams.get("standing") === "1") setChargeMode("standing");
    }
  }, [searchParams]);

  async function loadStandings() {
    const list = await api<
      Array<{
        id: string;
        titleHe: string;
        expectedAmount: number | string;
        categoryKey: string;
        startMonth: string | null;
        payVia: string;
        creditCardId: string | null;
      }>
    >("/budget/commitments");
    setCardStandings(
      list.filter(
        (c) => c.payVia === "CREDIT_CARD" && c.creditCardId === id,
      ),
    );
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה"),
    );
    loadStandings().catch(() => setCardStandings([]));
    api<UserCat[]>("/categories")
      .then(setUserCats)
      .catch(() => setUserCats([]));
  }, [id, month]);

  useEffect(() => {
    setChargeDate(defaultBookedDate(month));
    setPlanStart(month);
  }, [month]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!card) return;
    setBusy(true);
    try {
      await api(`/credit-cards/${card.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          currentBalance: Number(balance) || 0,
          creditLimit: limit.trim() === "" ? 0 : Math.abs(Number(limit) || 0),
          nextBillingDate: billing || null,
          billingDay: (() => {
            if (billingDay.trim() === "") return null;
            const n = Math.floor(Number(billingDay));
            return Number.isFinite(n) && n >= 1 && n <= 28 ? n : null;
          })(),
        }),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePlan(e: FormEvent) {
    e.preventDefault();
    if (!card) return;
    setBusy(true);
    try {
      await api(`/credit-cards/${card.id}/installments`, {
        method: "POST",
        body: JSON.stringify({
          titleHe: planTitle.trim(),
          originalAmount: Number(planOriginal),
          installmentCount: Number(planCount),
          chargedCount: Number(planCharged || 0),
          startMonth: planStart,
        }),
      });
      setOpenPlan(false);
      setPlanTitle("");
      setPlanOriginal("");
      setPlanCount("12");
      setPlanCharged("0");
      await load();
      setChargeFeedback("הפריסה נשמרה — רשמו חודשים חסרים ב«רשום פריסות לחודש»");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onRecordCharge(e: FormEvent) {
    e.preventDefault();
    if (!card) return;
    const amount = Number(chargeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("נא להזין סכום תקין");
      return;
    }
    if (!chargeDesc.trim()) {
      setError("נא להזין תיאור");
      return;
    }
    if (!chargeCategory) {
      setError("נא לבחור קטגוריה");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (chargeMode === "standing") {
        await api("/budget/commitments", {
          method: "POST",
          body: JSON.stringify({
            titleHe: chargeDesc.trim(),
            categoryKey: chargeCategory,
            expectedAmount: amount,
            nature: "FIXED",
            cadence: "MONTHLY",
            payVia: "CREDIT_CARD",
            creditCardId: card.id,
            startMonth: month,
          }),
        });
        setChargeDesc("");
        setChargeAmount("");
        setChargeInstallments("1");
        setChargeMode("once");
        await loadStandings();
        setChargeFeedback(
          `נוספה הוראת קבע באשראי מ־${month} — תופיע בתנועות כקנייה בכרטיס בכל חודש`,
        );
        return;
      }

      const res = await api<{
        mode: "ONE_TIME" | "INSTALLMENTS";
        thisMonthCharge: number;
        futureCommitment: number;
        installmentCount: number;
      }>(`/credit-cards/${card.id}/charges`, {
        method: "POST",
        body: JSON.stringify({
          description: chargeDesc.trim(),
          amount,
          categoryKey: chargeCategory,
          bookedAt: `${chargeDate}T12:00:00.000Z`,
          installmentCount: installmentN,
        }),
      });
      setChargeDesc("");
      setChargeAmount("");
      setChargeInstallments("1");
      setChargeMode("once");
      await load();
      if (res.mode === "INSTALLMENTS") {
        setChargeFeedback(
          `נרשם תשלום 1/${res.installmentCount} · ${formatIls(res.thisMonthCharge)}` +
            (res.futureCommitment > 0
              ? ` · נותרו ${formatIls(res.futureCommitment)} בחודשים הבאים`
              : ""),
        );
      } else {
        setChargeFeedback(`נרשמה קנייה · ${formatIls(res.thisMonthCharge)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function executeDeactivateStanding(standingId: string) {
    setBusy(true);
    setError(null);
    setPendingConfirm(null);
    try {
      await api(`/budget/commitments/${standingId}/deactivate`, {
        method: "POST",
      });
      setChargeFeedback("הוראת הקבע באשראי הוסרה");
      await loadStandings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!card) return;
    setPendingConfirm({ kind: "remove-card" });
  }

  async function executeRemoveCard() {
    if (!card) return;
    setPendingConfirm(null);
    await api(`/credit-cards/${card.id}`, { method: "DELETE" });
    router.push(appHref("/app/debts/cards", month));
  }

  async function onDeletePlan(plan: Plan) {
    setPendingConfirm({ kind: "delete-plan", plan });
  }

  async function executeDeletePlan(plan: Plan) {
    if (!card) return;
    setBusy(true);
    setError(null);
    setPendingConfirm(null);
    try {
      await api(`/credit-cards/${card.id}/installments/${plan.id}`, {
        method: "DELETE",
      });
      await load();
      setChargeFeedback(`נמחקה הפריסה «${plan.titleHe}»`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteTx(tx: CardDetail["transactions"][number]) {
    setPendingConfirm({ kind: "delete-tx", tx });
  }

  async function executeDeleteTx(tx: CardDetail["transactions"][number]) {
    if (!card) return;
    setBusy(true);
    setError(null);
    setPendingConfirm(null);
    try {
      await api(`/transactions/${tx.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onChargeDueMonth() {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        chargedCount: number;
        chargedTotal: number;
        charged: Array<{ month: string; paymentIndex: number; titleHe: string }>;
      }>(
        `/credit-cards/installments/charge-due?month=${encodeURIComponent(month)}&creditCardId=${encodeURIComponent(card.id)}`,
        { method: "POST" },
      );
      await load();
      if (res.chargedCount === 0) {
        setChargeFeedback("אין תשלומי פריסה חסרים עד החודש הנבחר");
      } else {
        const months = [...new Set(res.charged.map((c) => c.month))].join(", ");
        setChargeFeedback(
          `נרשמו ${res.chargedCount} תשלומים · ${formatIls(res.chargedTotal)}` +
            (months ? ` (${months})` : ""),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  const chargeMonthKey = chargeDate.slice(0, 7);
  const chargeOutsideFocus =
    /^\d{4}-\d{2}$/.test(chargeMonthKey) && chargeMonthKey !== month;

  if (!card && !error) return <p className="muted">טוען…</p>;
  if (error && !card) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }
  if (!card) return null;

  return (
    <div className="stack debts-page">
      <PageHeader
        kicker="כרטיס אשראי"
        title={
          card.lastFour ? `${card.name} ·••• ${card.lastFour}` : card.name
        }
        subtitle={card.provider || "פרטי כרטיס אשראי"}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setOpenCharge(true);
                setChargeMode("standing");
                setOpenPlan(false);
                setEditing(false);
              }}
            >
              הוראת קבע
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpenCharge((v) => !v);
                if (!openCharge) setChargeMode("once");
                setOpenPlan(false);
                setEditing(false);
              }}
            >
              {openCharge ? "סגור" : "+ תנועה בכרטיס"}
            </button>
          </div>
        }
        footer={<DebtsSubNav />}
      />
      <PeriodBar />
      <Link href={appHref("/app/debts/cards", month)} className="muted">
        ← חזרה לכרטיסים
      </Link>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {pendingConfirm?.kind === "remove-card" && (
        <ConfirmPanel
          title="הסרת כרטיס"
          danger
          busy={busy}
          confirmLabel="הסרה"
          message={`להסיר את «${card.name}»?`}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void executeRemoveCard()}
        />
      )}
      {pendingConfirm?.kind === "delete-plan" && (
        <ConfirmPanel
          title="מחיקת פריסה"
          danger
          busy={busy}
          confirmLabel="מחיקה"
          message={`למחוק את «${pendingConfirm.plan.titleHe}»? יבוטלו ההתחייבות והחיובים המקושרים (יתרת המחזור תתעדכן).`}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void executeDeletePlan(pendingConfirm.plan)}
        />
      )}
      {pendingConfirm?.kind === "delete-tx" && (
        <ConfirmPanel
          title="מחיקת תנועה"
          danger
          busy={busy}
          confirmLabel="מחיקה"
          message={
            pendingConfirm.tx.installmentPlanId
              ? "למחוק את התנועה? זו עסקת תשלומים — הפריסה תתעדכן בהתאם."
              : "למחוק את התנועה?"
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void executeDeleteTx(pendingConfirm.tx)}
        />
      )}
      {pendingConfirm?.kind === "deactivate-standing" && (
        <ConfirmPanel
          title="הסרת הוראת קבע באשראי"
          danger
          busy={busy}
          confirmLabel="הסרה"
          message={`להסיר את «${pendingConfirm.titleHe}»? חיובים שכבר נרשמו נשארים.`}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void executeDeactivateStanding(pendingConfirm.id)}
        />
      )}
      {chargeFeedback && !error && (
        <p className="badge good" role="status">
          {chargeFeedback}
        </p>
      )}

      <section className="debts-totals debts-totals--credit" aria-label="סיכום כרטיס">
        <p className="debts-totals-eyebrow">חיוב קרוב · {labelMonthHe(month)}</p>
        <div className="debts-totals-hero">
          <div>
            <span className="muted">יתרת מחזור לחיוב</span>
            <strong>{formatIls(card.upcomingCharge)}</strong>
          </div>
          <div className="debts-totals-side">
            <div>
              <span className="muted">הוצאות במחזור</span>
              <strong>{formatIls(card.cycleSpend)}</strong>
            </div>
            <div>
              <span className="muted">זמין</span>
              <strong>{formatIls(card.availableCredit)}</strong>
            </div>
            <div>
              <span className="muted">יום חיוב</span>
              <strong>
                {card.billingDay != null ? `ב־${card.billingDay} לחודש` : "—"}
              </strong>
            </div>
            <div>
              <span className="muted">חיוב הבא</span>
              <strong>{formatDate(card.nextBillingDate)}</strong>
            </div>
          </div>
        </div>
        {card.creditLimit > 0 && (
          <DebtSplitMeter
            variant="credit"
            title="מסגרת"
            titleAmount={card.creditLimit}
            emphasis={`${card.utilizationPct}%`}
            leftPct={card.utilizationPct}
            leftLabel="בשימוש"
            leftAmount={card.currentBalance}
            rightLabel="זמין"
            rightAmount={card.availableCredit}
          />
        )}
        {(card.installmentCommitment > 0 || card.monthlyInstallments > 0) && (
          <p className="muted debts-totals-note">
            התחייבות תשלומים שנותרה: {formatIls(card.installmentCommitment)}
            {card.monthlyInstallments > 0
              ? ` · כ־${formatIls(card.monthlyInstallments)} לחודש`
              : ""}
            . «הוצאות במחזור» = רק תאריכים בחודש {labelMonthHe(month)}.
          </p>
        )}
      </section>

      {openCharge && (
        <form
          className="card-tx-draft"
          onSubmit={onRecordCharge}
          aria-label={
            chargeMode === "standing"
              ? "הוראת קבע חדשה בכרטיס"
              : "תנועה חדשה בכרטיס"
          }
        >
          <p className="debts-totals-eyebrow">
            {chargeMode === "standing" ? "הוראת קבע באשראי" : "תנועה בכרטיס"}
          </p>
          <p className="muted debt-wizard-hint">
            {chargeMode === "standing"
              ? `נשמרת לחודש ${labelMonthHe(month)} ואילך — בכל חודש תירשם קנייה בכרטיס הזה (לא פריסת תשלומים).`
              : "דומה לתנועות — כאן הכרטיס כבר נבחר. שמירה רושמת קנייה / פריסה בלי לגעת בעו״ש עד סילוק."}
          </p>
          <div className="card-tx-draft-row">
            {chargeMode !== "standing" && (
              <input
                type="date"
                className="cell-input"
                value={chargeDate}
                onChange={(e) => setChargeDate(e.target.value)}
                aria-label="תאריך"
                required
              />
            )}
            <input
              className="cell-input"
              value={chargeDesc}
              onChange={(e) => setChargeDesc(e.target.value)}
              placeholder={
                chargeMode === "standing" ? "שם ההוראה (למשל מנוי)" : "עבור מה"
              }
              aria-label="תיאור"
              required
              autoFocus
            />
            <CategoryCombobox
              options={expenseCats}
              value={chargeCategory}
              onChange={setChargeCategory}
              disabled={busy}
            />
            <input
              className="cell-input card-tx-amt"
              type="number"
              min={0.01}
              step="0.01"
              value={chargeAmount}
              onChange={(e) => setChargeAmount(e.target.value)}
              placeholder="סכום"
              aria-label="סכום"
              required
            />
            <button className="btn" type="submit" disabled={busy}>
              {chargeMode === "standing" ? "שמור הוראת קבע" : "שמירה"}
            </button>
          </div>
          <div className="card-tx-draft-pay">
            <div className="dir-chips" role="group" aria-label="סוג רישום בכרטיס">
              <button
                type="button"
                className={`dir-chip${chargeMode === "once" ? " active" : ""}`}
                onClick={() => {
                  setChargeMode("once");
                  setChargeInstallments("1");
                }}
              >
                חד־פעמי
              </button>
              <button
                type="button"
                className={`dir-chip${chargeMode === "installments" ? " active" : ""}`}
                onClick={() => {
                  setChargeMode("installments");
                  setChargeInstallments((n) =>
                    Math.max(2, Number(n) || 1) >= 2 ? n : "3",
                  );
                }}
              >
                בתשלומים
              </button>
              <button
                type="button"
                className={`dir-chip${chargeMode === "standing" ? " active" : ""}`}
                onClick={() => setChargeMode("standing")}
              >
                הוראת קבע
              </button>
            </div>
            {chargeMode === "installments" && (
              <label className="field card-tx-n">
                <span>מספר תשלומים</span>
                <input
                  type="number"
                  min={2}
                  max={48}
                  value={chargeInstallments}
                  onChange={(e) => setChargeInstallments(e.target.value)}
                  required
                />
              </label>
            )}
          </div>
          <p className="card-charge-semantics">
            {chargeMode === "standing"
              ? `חיוב חוזר בכל חודש על «${card.name}» — לא פריסה חד־פעמית.`
              : chargeMode === "once"
                ? "הסכום המלא נכנס להוצאות חודש התאריך וליתרת המחזור."
                : monthlyPreview != null
                  ? `תשלום 1/${installmentN}: ${formatIls(monthlyPreview)} עכשיו · שאר ${formatIls(Math.round((chargeTotal - monthlyPreview) * 100) / 100)} בחודשים הבאים בלוח הפריסה.`
                  : "רק תשלום ראשון נספר עכשיו; היתר בלוח החודשים."}
            {chargeMode !== "standing" && chargeOutsideFocus
              ? ` התאריך בחודש ${chargeMonthKey} — לא ב«הוצאות במחזור» של ${month}.`
              : ""}
          </p>
        </form>
      )}

      {cardStandings.length > 0 && (
        <section className="card" aria-label="הוראות קבע באשראי">
          <p className="debts-totals-eyebrow">הוראות קבע בכרטיס זה</p>
          <ul
            className="card-standing-list"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            {cardStandings.map((s) => (
              <li
                key={s.id}
                className="list-row"
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  padding: "0.55rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <strong>{s.titleHe}</strong>
                  <span
                    className="muted"
                    style={{ marginInlineStart: "0.5rem" }}
                  >
                    {formatIls(Number(s.expectedAmount))} / חודש
                    {s.startMonth ? ` · מ־${s.startMonth}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="linkish muted"
                  disabled={busy}
                  aria-label={`הסרת הוראת קבע ${s.titleHe}`}
                  onClick={() =>
                    setPendingConfirm({
                      kind: "deactivate-standing",
                      id: s.id,
                      titleHe: s.titleHe,
                    })
                  }
                >
                  הסרה
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="debts-detail-section" aria-label="תשלומים פעילים">
        <div className="loan-card-head">
          <h2 style={{ margin: 0, fontSize: "1rem" }}>תשלומים פעילים</h2>
          <div className="debts-tx-row-actions">
            {duePlanCount > 0 && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void onChargeDueMonth()}
              >
                רשום פריסות עד {labelMonthHe(month)}
              </button>
            )}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setOpenPlan((v) => !v);
                setOpenCharge(false);
                setEditing(false);
              }}
            >
              {openPlan ? "סגור" : "ייבוא פריסה קיימת"}
            </button>
          </div>
        </div>
        {openPlan && (
          <form className="compact-form" onSubmit={onCreatePlan}>
            <p className="muted debt-wizard-hint">
              לפריסה שכבר רצה מחוץ לאפליקציה — בלי הוצאה חדשה. לחיוב חדש: «+ תנועה
              בכרטיס».
            </p>
            <label className="field">
              <span>תיאור</span>
              <input
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                required
              />
            </label>
            <div className="grid grid-2">
              <label className="field">
                <span>סכום מקורי</span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={planOriginal}
                  onChange={(e) => setPlanOriginal(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>מספר תשלומים</span>
                <input
                  type="number"
                  min={2}
                  value={planCount}
                  onChange={(e) => setPlanCount(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="grid grid-2">
              <label className="field">
                <span>כבר חויבו</span>
                <input
                  type="number"
                  min={0}
                  value={planCharged}
                  onChange={(e) => setPlanCharged(e.target.value)}
                />
              </label>
              <label className="field">
                <span>חודש התחלה</span>
                <input
                  value={planStart}
                  onChange={(e) => setPlanStart(e.target.value)}
                  placeholder="YYYY-MM"
                  required
                />
              </label>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              שמירת פריסה
            </button>
          </form>
        )}
        {card.installmentPlans.length === 0 ? (
          <p className="muted debts-item-hint">
            אין פריסות פעילות. הוסיפו תנועה «בתשלומים» או ייבוא פריסה.
          </p>
        ) : (
          <ul className="card-plan-list">
            {card.installmentPlans.map((p) => (
              <li key={p.id} className="card-plan-item">
                <div className="card-plan-head">
                  <strong>{p.titleHe}</strong>
                  <span className="muted">
                    {formatIls(p.installmentAmount)}/חודש ·{" "}
                    {formatIls(p.remainingAmount)} נותר
                  </span>
                  <button
                    type="button"
                    className="linkish muted"
                    disabled={busy}
                    onClick={() => onDeletePlan(p)}
                  >
                    מחיקה
                  </button>
                </div>
                <div
                  className="card-plan-schedule"
                  role="list"
                  aria-label={`לוח תשלומים ל${p.titleHe}`}
                >
                  {(p.schedule || []).map((s) => (
                    <span
                      key={`${p.id}-${s.month}`}
                      role="listitem"
                      className={`card-plan-slot card-plan-slot--${s.status}${
                        s.month === month ? " card-plan-slot--focus" : ""
                      }`}
                      title={`${s.month}: תשלום ${s.index}/${p.installmentCount} · ${formatIls(s.amount)} · ${
                        s.status === "paid"
                          ? "נרשם"
                          : s.status === "due"
                            ? "חסר — רשמו פריסות"
                            : "עתידי"
                      }`}
                    >
                      <span className="card-plan-slot-m">
                        {shortMonthHe(s.month)}
                      </span>
                      <span className="card-plan-slot-i">{s.index}</span>
                    </span>
                  ))}
                </div>
                <p className="muted card-plan-legend">
                  ✓ נרשם · ● חסר עד החודש הנבחר · ○ עתידי
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="debts-detail-section" aria-label="תנועות מקושרות">
        <div className="loan-card-head">
          <h2 style={{ margin: 0, fontSize: "1rem" }}>תנועות מקושרות</h2>
          <Link
            className="linkish"
            href={`${appHref("/app/money", month)}&creditCardId=${card.id}`}
          >
            לתנועות
          </Link>
        </div>
        {card.transactions.length === 0 ? (
          <p className="muted debts-item-hint">
            אין תנועות. לחצו «+ תנועה בכרטיס» או רשמו פריסות לחודש.
          </p>
        ) : (
          <ul className="debts-tx-list debts-tx-list--actions">
            {card.transactions.map((t) => (
              <li key={t.id}>
                <span>{formatDate(t.bookedAt)}</span>
                <span>
                  {t.description || t.economicRole}
                  {t.economicRole === "CARD_SETTLEMENT" ? " · סילוק" : ""}
                  {t.economicRole === "CARD_PURCHASE" && !t.installmentPlanId
                    ? " · קנייה"
                    : ""}
                  {t.installmentPlanId ? " · תשלומים" : ""}
                </span>
                <strong>{formatIls(t.amount)}</strong>
                <span className="debts-tx-row-actions">
                  <Link
                    className="linkish muted"
                    href={`${appHref("/app/money", month)}&creditCardId=${card.id}`}
                  >
                    עריכה
                  </Link>
                  <button
                    type="button"
                    className="linkish muted"
                    disabled={busy}
                    onClick={() => onDeleteTx(t)}
                  >
                    מחיקה
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="debts-item-primary-row" style={{ marginTop: "0.15rem" }}>
        <button
          type="button"
          className="linkish"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreOpen ? "פחות" : "עוד · עריכת כרטיס"}
        </button>
      </div>

      {moreOpen && (
        <div className="debts-item-more debts-detail-more">
          <div className="debt-post-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setEditing((v) => !v);
                setOpenPlan(false);
                setOpenCharge(false);
              }}
            >
              {editing ? "סגור עריכה" : "עריכת כרטיס"}
            </button>
            <button
              type="button"
              className="linkish muted"
              onClick={onRemove}
            >
              הסרה
            </button>
          </div>

          {editing && (
            <form className="compact-form" onSubmit={onSave}>
              <div className="grid grid-2">
                <label className="field">
                  <span>יתרת מחזור</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>מסגרת</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="אופציונלי"
                  />
                </label>
              </div>
              <label className="field">
                <span>יום חיוב בחודש (1–28)</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value)}
                  placeholder="למשל 10"
                  inputMode="numeric"
                />
              </label>
              <label className="field">
                <span>מועד חיוב הבא</span>
                <input
                  type="date"
                  value={billing}
                  onChange={(e) => setBilling(e.target.value)}
                />
              </label>
              <button className="btn" type="submit" disabled={busy}>
                שמירה
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardDetailPage() {
  return (
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <CardDetailInner />
    </Suspense>
  );
}
