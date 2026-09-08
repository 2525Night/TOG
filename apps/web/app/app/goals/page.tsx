"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, formatIls } from "@/lib/api";
import {
  labelMonthHe,
  monthOptionsAround,
  useSelectedMonth,
  PeriodBar,
  appHref,
} from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { Pulse } from "@/components/Pulse";
import { FeelRow } from "@/components/FeelRow";
import { WinStrip } from "@/components/WinStrip";
import { GoalsPoolPie } from "@/components/Charts";
import { ConfirmPanel } from "@/components/ConfirmPanel";

type Forecast = {
  remaining: number;
  monthlyPace: number;
  paceSource: "standing" | "average" | "target_needed" | "none";
  targetNeeded: number | null;
  etaMonth: string | null;
  onTrack: boolean | null;
  shortfallPerMonth: number | null;
};

type Standing = {
  id: string;
  monthlyAmount: number;
  anchorDay: number | null;
  startMonth: string;
  endMonth: string | null;
  untilGoal: boolean;
  monthsLeft: number | null;
  pendingMonths: string[];
  activeInFocusMonth: boolean;
};

type Goal = {
  id: string;
  title: string;
  kind?: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  /** Cumulative funded amount as of the selected month (for progress UI). */
  savedAsOfMonth: number;
  standing: Standing | null;
  doneThisMonth: boolean;
  monthAllocated: number;
  contributions: Array<{
    id: string;
    amount: number;
    bookedAt: string;
    description: string | null;
  }>;
  forecast: Forecast;
};

type MonthPool = {
  month: string;
  leftover: number;
  allocated: number;
  plannedStanding: number;
  free: number;
  poolBase: number;
  tight: boolean;
  labelHe: string;
  checkingBalanceNow?: number;
  hasEmergency?: boolean;
  showReserveCta?: boolean;
  suggestedReserveTarget?: number;
};

type ConfirmState = {
  goalId: string;
  titleHe: string;
  amount: number;
  month: string;
  mode:
    | "allocate"
    | "standing-range"
    | "standing-ask-apply"
    | "reverse"
    | "stop-standing";
  transactionId?: string;
  fromMonth?: string;
  toMonth?: string;
  pendingMonths?: string[];
};

type StandingPanel = {
  goalId: string;
  titleHe: string;
  amount: string;
  monthsPreset: string; // "1"…"12" | "custom" | "untilGoal"
  customMonths: string;
  /** Existing start; null when creating new standing. */
  savedStartMonth: string | null;
  moveStartToPageMonth: boolean;
};

function addMonthsYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetweenInclusive(from: string, to: string) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

function monthsInRangeYm(from: string, to: string) {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addMonthsYm(cur, 1);
    if (out.length > 60) break;
  }
  return out;
}

function pendingFromFocus(s: Standing, focusMonth: string) {
  return s.pendingMonths.filter((m) => m >= focusMonth);
}

function standingSpanLabel(s: Standing) {
  const from = `מ־${labelMonthHe(s.startMonth)}`;
  if (s.untilGoal) return `${from} · עד שהיעד מתמלא`;
  if (s.endMonth) return `${from} עד ${labelMonthHe(s.endMonth)}`;
  return from;
}

function panelFromStanding(g: Goal): StandingPanel {
  if (!g.standing) {
    return {
      goalId: g.id,
      titleHe: g.title,
      amount: "",
      monthsPreset: "6",
      customMonths: "18",
      savedStartMonth: null,
      moveStartToPageMonth: false,
    };
  }
  const s = g.standing;
  if (s.untilGoal) {
    return {
      goalId: g.id,
      titleHe: g.title,
      amount: String(s.monthlyAmount),
      monthsPreset: "untilGoal",
      customMonths: "18",
      savedStartMonth: s.startMonth,
      moveStartToPageMonth: false,
    };
  }
  if (s.startMonth && s.endMonth) {
    const n = monthsBetweenInclusive(s.startMonth, s.endMonth);
    if (n >= 1 && n <= 12) {
      return {
        goalId: g.id,
        titleHe: g.title,
        amount: String(s.monthlyAmount),
        monthsPreset: String(n),
        customMonths: "18",
        savedStartMonth: s.startMonth,
        moveStartToPageMonth: false,
      };
    }
    return {
      goalId: g.id,
      titleHe: g.title,
      amount: String(s.monthlyAmount),
      monthsPreset: "custom",
      customMonths: String(n),
      savedStartMonth: s.startMonth,
      moveStartToPageMonth: false,
    };
  }
  return {
    goalId: g.id,
    titleHe: g.title,
    amount: String(s.monthlyAmount),
    monthsPreset: "6",
    customMonths: "18",
    savedStartMonth: s.startMonth,
    moveStartToPageMonth: false,
  };
}

const FAR_HORIZON_MONTHS = 120; // 10 years

function paceLabel(f: Forecast) {
  if (f.paceSource === "average") {
    return `${formatIls(f.monthlyPace)} בחודש בממוצע`;
  }
  if (f.paceSource === "target_needed" && f.targetNeeded != null) {
    return `כדי להספיק: ${formatIls(f.targetNeeded)} בחודש`;
  }
  return null;
}

function monthsNeededFromForecast(f: Forecast): number | null {
  if (!(f.remaining > 0) || !(f.monthlyPace > 0)) return null;
  if (f.paceSource === "target_needed") return null;
  return Math.ceil(f.remaining / f.monthlyPace);
}

/** Friendly forecast lines — no distant calendar years. */
function forecastLines(f: Forecast, hasStanding: boolean): string[] {
  if (!(f.remaining > 0)) return [];
  const lines: string[] = [];
  const monthsNeeded = monthsNeededFromForecast(f);

  if (!hasStanding) {
    const pace = paceLabel(f);
    if (pace && !(monthsNeeded != null && monthsNeeded > FAR_HORIZON_MONTHS)) {
      lines.push(pace);
    }
  }

  if (monthsNeeded != null && monthsNeeded > FAR_HORIZON_MONTHS) {
    lines.push("בקצב הזה — מעל 10 שנים.");
    const need = Math.ceil(f.remaining / FAR_HORIZON_MONTHS);
    lines.push(`כדי להגיע תוך 10 שנים: כ־${formatIls(need)} בחודש.`);
  } else if (f.etaMonth) {
    lines.push(`בקצב הזה — כ־${labelMonthHe(f.etaMonth)}.`);
  }

  if (f.onTrack === false) {
    lines.push(
      f.shortfallPerMonth
        ? `באיחור · חסר ${formatIls(f.shortfallPerMonth)}/חודש`
        : "באיחור ביחס לתאריך היעד",
    );
  } else if (f.onTrack === true) {
    lines.push("עומדים ביעד");
  }

  return lines;
}

function GoalsInner() {
  const month = useSelectedMonth();
  const searchParams = useSearchParams();
  const monthChoices = useMemo(() => monthOptionsAround(12, 12), []);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pool, setPool] = useState<MonthPool | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState("5000");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [targetDate, setTargetDate] = useState("");
  const [createAsReserve, setCreateAsReserve] = useState(false);
  const [showReserveWizard, setShowReserveWizard] = useState(false);
  const [reserveTarget, setReserveTarget] = useState("3000");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgHref, setMsgHref] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [standingPanel, setStandingPanel] = useState<StandingPanel | null>(
    null,
  );
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false);
  const [allocateOpenId, setAllocateOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editCurrent, setEditCurrent] = useState("");
  const [editDate, setEditDate] = useState("");

  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const ae = a.kind === "EMERGENCY" ? 0 : 1;
      const be = b.kind === "EMERGENCY" ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.title.localeCompare(b.title, "he");
    });
  }, [goals]);

  const totalSaved = useMemo(
    () =>
      goals.reduce((s, g) => s + Number(g.savedAsOfMonth ?? g.currentAmount), 0),
    [goals],
  );

  async function refresh() {
    const [g, p] = await Promise.all([
      api<Goal[]>(`/goals?month=${month}`),
      api<MonthPool>(`/goals/month-pool?month=${month}`),
    ]);
    setGoals(g);
    setPool(p);
    return { goals: g, pool: p };
  }

  useEffect(() => {
    setMsg(null);
    setMsgHref(null);
    setError(null);
    setConfirm(null);
    setDeleteConfirm(null);
    setStandingPanel(null);
    setEditingId(null);
    setMoreOpenId(null);
    setAllocateOpenId(null);
    setShowReserveWizard(false);
    setCreateAsReserve(false);
    refresh().catch((e) => setError(e instanceof Error ? e.message : "שגיאה"));
  }, [month]);

  const hasEmergency = useMemo(
    () => goals.some((g) => g.kind === "EMERGENCY"),
    [goals],
  );

  const showReserveCta = Boolean(
    pool?.showReserveCta ??
      (!hasEmergency && (pool?.leftover ?? 0) > 0 && (pool?.checkingBalanceNow ?? 0) >= 0),
  );

  function suggestedReserveAmount() {
    if (pool?.suggestedReserveTarget != null) {
      return pool.suggestedReserveTarget;
    }
    const leftover = pool?.leftover ?? 0;
    return Math.max(3000, Math.round(leftover > 0 ? leftover * 3 : 3000));
  }

  function openReserveWizard() {
    setReserveTarget(String(suggestedReserveAmount()));
    setShowReserveWizard(true);
    setShowCreate(false);
    setError(null);
    setMsg(null);
  }

  async function createReserve(target: number) {
    if (!(target > 0)) {
      setError("נא להזין סכום יעד תקין");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "רזרבה להפתעות",
          kind: "EMERGENCY",
          targetAmount: target,
          currentAmount: 0,
        }),
      });
      setShowReserveWizard(false);
      setMsg("הרזרבה נוצרה — אפשר להקצות מהפנוי");
      setMsgHref(null);
      const { goals: list, pool: nextPool } = await refresh();
      const id = created?.id || list.find((g) => g.kind === "EMERGENCY")?.id;
      if (id && (nextPool?.free ?? 0) > 0) {
        setAllocateOpenId(id);
        setMoreOpenId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("reserve") !== "1") return;
    if (hasEmergency || !pool) return;
    openReserveWizard();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when deep-linked
  }, [searchParams, hasEmergency, pool?.month]);

  function openEdit(g: Goal) {
    setEditingId(g.id);
    setEditTitle(g.title);
    setEditTarget(String(g.targetAmount));
    setEditCurrent(String(g.currentAmount));
    setEditDate(g.targetDate ? String(g.targetDate).slice(0, 10) : "");
    setStandingPanel(null);
    setConfirm(null);
  }

  async function saveEdit(goalId: string) {
    const target = Number(editTarget);
    const current = Number(editCurrent);
    if (!(target > 0)) {
      setError("סכום יעד לא תקין");
      return;
    }
    if (current < 0 || Number.isNaN(current)) {
      setError("סכום נוכחי לא תקין");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          targetAmount: target,
          currentAmount: current,
          targetDate: editDate || null,
        }),
      });
      setEditingId(null);
      setMsg("היעד עודכן");
      setMsgHref(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function removeGoal(g: Goal) {
    setDeleteConfirm(g);
  }

  async function executeRemoveGoal(g: Goal) {
    setBusy(true);
    setError(null);
    setDeleteConfirm(null);
    try {
      await api(`/goals/${g.id}`, { method: "DELETE" });
      setMsg("היעד הוסר");
      setMsgHref(null);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (createAsReserve && hasEmergency) {
      setError("כבר קיימת רזרבה להפתעות");
      return;
    }
    const target = Number(targetAmount);
    if (!(target > 0)) {
      setError("סכום יעד לא תקין");
      return;
    }
    setBusy(true);
    try {
      const asReserve = createAsReserve && !hasEmergency;
      const created = await api<{ id: string; kind?: string }>("/goals", {
        method: "POST",
        body: JSON.stringify({
          title: asReserve
            ? title.trim() || "רזרבה להפתעות"
            : title.trim(),
          kind: asReserve ? "EMERGENCY" : "GENERAL",
          targetAmount: target,
          currentAmount: Number(currentAmount) || 0,
          targetDate: asReserve ? undefined : targetDate || undefined,
        }),
      });
      setShowCreate(false);
      setTitle("");
      setCurrentAmount("0");
      setTargetDate("");
      setCreateAsReserve(false);
      setMsg(asReserve ? "הרזרבה נשמרה" : "היעד נשמר");
      setMsgHref(null);
      const { goals: list, pool: nextPool } = await refresh();
      if (asReserve) {
        const id = created?.id || list.find((g) => g.kind === "EMERGENCY")?.id;
        if (id && (nextPool?.free ?? 0) > 0) setAllocateOpenId(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  function openAllocate(g: Goal, preset?: number) {
    const free = pool?.free ?? 0;
    const remaining = g.forecast.remaining;
    const raw = amounts[g.id];
    const amt = Number(
      preset ??
        (raw ||
          (free > 0 ? Math.round(Math.min(free, remaining || free, 500)) : 0)),
    );
    if (!(amt > 0)) {
      setError("הזינו סכום להקצאה");
      return;
    }
    setConfirm({
      goalId: g.id,
      titleHe: g.title,
      amount: amt,
      month,
      mode: "allocate",
    });
  }

  function openStandingThisMonth(g: Goal) {
    if (!g.standing) return;
    if (g.doneThisMonth) {
      setError("החודש כבר אושר ליעד זה");
      return;
    }
    if (!g.standing.pendingMonths.includes(month)) {
      setError("החודש הנבחר מחוץ להוראת הקבע או כבר בוצע");
      return;
    }
    setStandingPanel(null);
    setConfirm({
      goalId: g.id,
      titleHe: g.title,
      amount: g.standing.monthlyAmount,
      month,
      mode: "standing-range",
      fromMonth: month,
      toMonth: month,
      pendingMonths: g.standing.pendingMonths,
    });
  }

  function openStandingRange(g: Goal, pendingOverride?: string[]) {
    if (!g.standing) return;
    const pending = pendingOverride || pendingFromFocus(g.standing, month);
    if (pending.length === 0) {
      setError("אין חודשים ממתינים מהחודש הנבחר והלאה");
      return;
    }
    const horizon = addMonthsYm(month, 3);
    const endCap =
      g.standing.endMonth && g.standing.endMonth < horizon
        ? g.standing.endMonth
        : horizon;
    const inWindow = pending.filter((m) => m <= endCap);
    const fromMonth = inWindow[0] || pending[0];
    const toMonth = inWindow[inWindow.length - 1] || pending[pending.length - 1];
    setStandingPanel(null);
    setConfirm({
      goalId: g.id,
      titleHe: g.title,
      amount: g.standing.monthlyAmount,
      month,
      mode: "standing-range",
      fromMonth,
      toMonth,
      pendingMonths: g.standing.pendingMonths,
    });
  }

  async function commitConfirm() {
    if (!confirm) return;
    if (confirm.mode === "standing-ask-apply") {
      const g = goals.find((x) => x.id === confirm.goalId);
      if (g?.standing) {
        openStandingThisMonth(g);
      } else {
        setConfirm(null);
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (confirm.mode === "stop-standing") {
        await api(`/goals/${confirm.goalId}/standing/stop`, {
          method: "POST",
          body: "{}",
        });
        setMsg("הוראת הקבע הופסקה");
        setMsgHref(null);
      } else if (confirm.mode === "reverse" && confirm.transactionId) {
        const res = await api<{ messageHe?: string }>(
          `/goals/${confirm.goalId}/reverse-allocation`,
          {
            method: "POST",
            body: JSON.stringify({
              transactionId: confirm.transactionId,
              confirm: true,
            }),
          },
        );
        setMsg(res.messageHe || "ההקצאה בוטלה");
        setMsgHref(null);
      } else if (confirm.mode === "standing-range") {
        const res = await api<{ messageHe?: string }>(
          `/goals/${confirm.goalId}/standing/apply-range`,
          {
            method: "POST",
            body: JSON.stringify({
              fromMonth: confirm.fromMonth,
              toMonth: confirm.toMonth,
              confirm: true,
            }),
          },
        );
        setMsg(res.messageHe || "הקצאות הקבע בוצעו");
        setMsgHref(
          `${appHref("/app/money", confirm.fromMonth || month)}&category=goal_funding`,
        );
      } else {
        const res = await api<{
          messageHe?: string;
          month?: string;
        }>(`/goals/${confirm.goalId}/apply-surplus`, {
          method: "POST",
          body: JSON.stringify({
            amount: confirm.amount,
            confirm: true,
            month: confirm.month,
          }),
        });
        setMsg(res.messageHe || "ההקצאה בוצעה");
        setMsgHref(
          `${appHref("/app/money", res.month || confirm.month)}&category=goal_funding`,
        );
        setAmounts((prev) => ({ ...prev, [confirm.goalId]: "" }));
      }
      setConfirm(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function saveStandingPanel() {
    if (!standingPanel) return;
    const amt = Number(standingPanel.amount);
    if (!(amt > 0)) {
      setError("הזינו סכום להוראת קבע");
      return;
    }
    const isNew = !standingPanel.savedStartMonth;
    const body: Record<string, unknown> = {
      monthlyAmount: amt,
    };
    if (isNew || standingPanel.moveStartToPageMonth) {
      body.startMonth = month;
    }
    if (standingPanel.monthsPreset === "untilGoal") {
      body.untilGoal = true;
    } else if (standingPanel.monthsPreset === "custom") {
      const n = Number(standingPanel.customMonths);
      if (!(n >= 1 && n <= 60)) {
        setError("מספר חודשים: 1–60");
        return;
      }
      body.monthsCount = n;
      body.untilGoal = false;
    } else {
      body.monthsCount = Number(standingPanel.monthsPreset) || 6;
      body.untilGoal = false;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/goals/${standingPanel.goalId}/standing`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStandingPanel(null);
      setMsg("הוראת הקבע נשמרה");
      setMsgHref(null);
      const refreshed = await refresh();
      const g = refreshed.goals.find((x) => x.id === standingPanel.goalId);
      if (g?.standing) {
        const pending = pendingFromFocus(g.standing, month);
        if (pending.includes(month)) {
          setConfirm({
            goalId: g.id,
            titleHe: g.title,
            amount: g.standing.monthlyAmount,
            month,
            mode: "standing-ask-apply",
            pendingMonths: pending,
            fromMonth: month,
            toMonth: month,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  const previewPool = useMemo(() => {
    if (!confirm || !pool || confirm.mode !== "allocate") return null;
    const allocated = pool.allocated + confirm.amount;
    const free = Math.max(0, pool.free - confirm.amount);
    const planned = pool.plannedStanding;
    return {
      allocated,
      free,
      planned,
      total: Math.max(pool.poolBase, allocated + planned + free, 1),
    };
  }, [confirm, pool]);

  const rangePreview = useMemo(() => {
    if (
      !confirm ||
      confirm.mode !== "standing-range" ||
      !confirm.fromMonth ||
      !confirm.toMonth
    ) {
      return null;
    }
    const pending = new Set(confirm.pendingMonths || []);
    const now = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    return monthsInRangeYm(confirm.fromMonth, confirm.toMonth).map((m) => ({
      month: m,
      willApply: pending.has(m),
      future: m > now,
      label: labelMonthHe(m),
    }));
  }, [confirm]);

  const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const panelEndPreview = useMemo(() => {
    if (!standingPanel || standingPanel.monthsPreset === "untilGoal") return null;
    const n =
      standingPanel.monthsPreset === "custom"
        ? Number(standingPanel.customMonths) || 0
        : Number(standingPanel.monthsPreset) || 0;
    if (!(n >= 1)) return null;
    const start =
      standingPanel.moveStartToPageMonth || !standingPanel.savedStartMonth
        ? month
        : standingPanel.savedStartMonth;
    return addMonthsYm(start, n - 1);
  }, [standingPanel, month]);

  useEffect(() => {
    const id = confirm?.goalId ?? standingPanel?.goalId;
    if (!id) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`goal-panel-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [confirm?.goalId, confirm?.mode, standingPanel?.goalId]);

  const standingPanelEl = standingPanel ? (
    <section
      id={`goal-panel-${standingPanel.goalId}`}
      className="card confirm-panel goal-inline-panel"
    >
          <h2 style={{ marginTop: 0 }}>
            הוראת קבע · {standingPanel.titleHe}
          </h2>
          {standingPanel.savedStartMonth ? (
            <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
              התחלה שמורה:{" "}
              <strong>{labelMonthHe(standingPanel.savedStartMonth)}</strong>
              {standingPanel.moveStartToPageMonth
                ? ` → תשתנה ל־${labelMonthHe(month)}`
                : ""}
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
              תתחיל מ־<strong>{labelMonthHe(month)}</strong> (החודש בראש הדף)
            </p>
          )}
          <label className="field">
            <span>סכום לחודש</span>
            <input
              type="number"
              min="1"
              value={standingPanel.amount}
              onChange={(e) =>
                setStandingPanel({ ...standingPanel, amount: e.target.value })
              }
              placeholder="למשל 500"
            />
          </label>
          <label className="field">
            <span>לכמה חודשים? (כמו פריסה)</span>
            <select
              value={
                standingPanel.monthsPreset === "untilGoal"
                  ? "untilGoal"
                  : standingPanel.monthsPreset === "custom"
                    ? "custom"
                    : standingPanel.monthsPreset
              }
              onChange={(e) => {
                const v = e.target.value;
                setStandingPanel({
                  ...standingPanel,
                  monthsPreset: v,
                });
              }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n} חודשים
                </option>
              ))}
              <option value="custom">מותאם אישית…</option>
              <option value="untilGoal">עד שהיעד מתמלא</option>
            </select>
          </label>
          {standingPanel.monthsPreset === "custom" && (
            <label className="field">
              <span>מספר חודשים</span>
              <input
                type="number"
                min="1"
                max="60"
                value={standingPanel.customMonths}
                onChange={(e) =>
                  setStandingPanel({
                    ...standingPanel,
                    customMonths: e.target.value,
                  })
                }
              />
            </label>
          )}
          {panelEndPreview && (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              עד {labelMonthHe(panelEndPreview)} כולל
            </p>
          )}
          {standingPanel.savedStartMonth &&
            standingPanel.savedStartMonth !== month && (
              <label
                className="field"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={standingPanel.moveStartToPageMonth}
                  onChange={(e) =>
                    setStandingPanel({
                      ...standingPanel,
                      moveStartToPageMonth: e.target.checked,
                    })
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>
                  שנה התחלה לחודש המסך ({labelMonthHe(month)})
                </span>
              </label>
            )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => saveStandingPanel()}
            >
              שמירה
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => setStandingPanel(null)}
            >
              ביטול
            </button>
          </div>
        </section>
  ) : null;

  const confirmPanelEl = confirm ? (
    <section
      id={`goal-panel-${confirm.goalId}`}
      className="card confirm-panel goal-inline-panel"
    >
          <h2 style={{ marginTop: 0 }}>
            {confirm.mode === "reverse"
              ? "ביטול הקצאה"
              : confirm.mode === "stop-standing"
                ? "הפסקת הוראת קבע"
                : confirm.mode === "standing-ask-apply"
                  ? "אשר לחודש הזה?"
                  : confirm.mode === "standing-range"
                    ? confirm.fromMonth === confirm.toMonth
                      ? "אשר לחודש הזה"
                      : "ביצוע הוראת קבע"
                    : "אישור הקצאה"}
          </h2>
          {confirm.mode === "stop-standing" ? (
            <p className="muted">
              להפסיק את הוראת הקבע ליעד «{confirm.titleHe}»? הקצאות שכבר בוצעו
              נשארות.
            </p>
          ) : confirm.mode === "standing-ask-apply" ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                הקבע נשמר. לאשר הקצאה לחודש{" "}
                <strong>{labelMonthHe(month)}</strong> (
                {formatIls(confirm.amount)})?
              </p>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                תירשם תנועת ליעדים לחודש זה. בחודש עתידי — גם בלי נותר עדיין.
              </p>
            </>
          ) : confirm.mode === "reverse" ? (
            <p className="muted">
              לבטל {formatIls(confirm.amount)} שנרשמו ל«{confirm.titleHe}» ב־
              {labelMonthHe(confirm.month)}? היעד יירד והתנועה תוסר.
            </p>
          ) : confirm.mode === "standing-range" ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                להקצות <strong>{formatIls(confirm.amount)}</strong> בחודש ליעד «
                {confirm.titleHe}» בטווח שנבחר?
              </p>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                יירשמו תנועות ליעדים בחודשים שנבחרו. בחודשים עתידיים — גם בלי
                נותר עדיין.
              </p>
              <div className="grid grid-2" style={{ gap: "0.65rem" }}>
                <label className="field">
                  <span>מ־חודש</span>
                  <select
                    value={confirm.fromMonth}
                    onChange={(e) =>
                      setConfirm({ ...confirm, fromMonth: e.target.value })
                    }
                  >
                    {monthChoices.map((ym) => (
                      <option key={ym} value={ym}>
                        {labelMonthHe(ym)}
                        {ym > nowKey ? " (עתידי)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>עד חודש</span>
                  <select
                    value={confirm.toMonth}
                    onChange={(e) =>
                      setConfirm({ ...confirm, toMonth: e.target.value })
                    }
                  >
                    {monthChoices.map((ym) => (
                      <option key={ym} value={ym}>
                        {labelMonthHe(ym)}
                        {ym > nowKey ? " (עתידי)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {rangePreview && rangePreview.length > 0 && (
                <ul className="standing-range-list muted">
                  {rangePreview.map((row) => (
                    <li key={row.month}>
                      {row.label}
                      {row.willApply
                        ? ` · יוקצה ${formatIls(confirm.amount)}`
                        : " · כבר בוצע / מחוץ לקבע"}
                      {row.future && row.willApply ? " (עתידי)" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                להקצות <strong>{formatIls(confirm.amount)}</strong> ליעד «
                {confirm.titleHe}» מחודש{" "}
                <strong>{labelMonthHe(confirm.month)}</strong>?
              </p>
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                יירשם גם כתנועה בקטגוריה <strong>ליעדים</strong> — וירד מהנותר של
                אותו חודש.
              </p>
              <label className="field">
                <span>חודש הקצאה</span>
                <select
                  value={confirm.month}
                  onChange={(e) =>
                    setConfirm({ ...confirm, month: e.target.value })
                  }
                >
                  {monthChoices.map((ym) => (
                    <option key={ym} value={ym}>
                      {labelMonthHe(ym)}
                      {ym > nowKey ? " (עתידי)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {confirm.month > nowKey && (
                <p
                  className="muted"
                  style={{ fontSize: "0.85rem", color: "var(--warn)" }}
                >
                  חודש עתידי — התנועה תישמר לחודש הזה גם בלי נותר עדיין.
                </p>
              )}
              {previewPool && (
                <div className="month-pool-bar mini" aria-hidden>
                  <div
                    className="month-pool-seg allocated"
                    style={{
                      width: `${Math.min(100, (previewPool.allocated / previewPool.total) * 100)}%`,
                    }}
                  />
                  <div
                    className="month-pool-seg planned"
                    style={{
                      width: `${Math.min(100, (previewPool.planned / previewPool.total) * 100)}%`,
                    }}
                  />
                  <div
                    className="month-pool-seg free"
                    style={{
                      width: `${Math.min(100, (previewPool.free / previewPool.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => commitConfirm()}
            >
              {confirm.mode === "standing-ask-apply"
                ? "אשר לחודש הזה"
                : "אישור"}
            </button>
            {confirm.mode === "standing-ask-apply" ? (
              <>
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() => {
                    const g = goals.find((x) => x.id === confirm.goalId);
                    if (g) openStandingRange(g, confirm.pendingMonths);
                  }}
                >
                  לטווח חודשים…
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  לא עכשיו
                </button>
              </>
            ) : (
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                ביטול
              </button>
            )}
          </div>
        </section>
  ) : null;

  return (
    <div className="grid goals-page" style={{ gap: "0.85rem" }}>
      <PageHeader
        kicker="יעדים · שמירה על אש קטנה"
        title="המטרה גדולה. הצעד קטן. ככה לא מאבדים מוטיבציה."
        subtitle="יעדים שבורים לצעדים שאפשר לנשום איתם. אם השבוע קשה — מצמצמים את הצעד, לא זורקים את הדרך."
        actions={
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setShowReserveWizard(false);
              setCreateAsReserve(false);
            }}
          >
            {showCreate ? "סגור" : "יעד חדש"}
          </button>
        }
      />

      <PeriodBar />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {deleteConfirm && (
        <ConfirmPanel
          title="הסרת יעד"
          danger
          busy={busy}
          confirmLabel="הסרה"
          message={`להסיר את «${deleteConfirm.title}»? הוראת קבע תופסק. הקצאות שכבר נרשמו בתנועות נשארות — אפשר לבטל אותן ממסך התנועות או מרשימת ההקצאות.`}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => void executeRemoveGoal(deleteConfirm)}
        />
      )}
      {msg && (
        <p className="badge good">
          {msg}
          {msgHref && (
            <>
              {" · "}
              <Link href={msgHref}>לתנועות</Link>
            </>
          )}
        </p>
      )}

      {pool && (
        <section className="goals-totals" aria-label="פנוי להקצאה">
          <div className="clarity-answer" style={{ paddingBottom: "0.25rem" }}>
            <span className="clarity-answer-label">
              פנוי להקצאה · {pool.labelHe}
            </span>
            <div className="clarity-answer-value">{formatIls(pool.free)}</div>
          </div>
          <div className="goals-pool-layout">
            <GoalsPoolPie
              allocated={pool.allocated}
              plannedStanding={pool.plannedStanding}
              free={pool.free}
              hint={
                pool.tight
                  ? "הקבע גדול מהפנוי — בחרו למי קודם"
                  : pool.free > 0
                    ? hasEmergency &&
                      goals.some(
                        (g) =>
                          g.kind === "EMERGENCY" &&
                          Number(g.currentAmount) < Number(g.targetAmount),
                      )
                      ? "מומלץ להקצות קודם לרזרבה"
                      : "אפשר להקצות ליעד למטה"
                    : undefined
              }
            />
            <div className="goals-pool-meta">
              {Math.abs(pool.leftover - pool.free) > 0.5 && (
                <div className="goals-pool-stat">
                  <span className="muted">נותר אחרי הוצאות</span>
                  <strong>{formatIls(pool.leftover)}</strong>
                </div>
              )}
              {totalSaved > 0 && (
                <div className="goals-pool-saved">
                  <span className="goals-pool-saved-eyebrow">עד כה</span>
                  <strong className="goals-pool-saved-amt">
                    {formatIls(totalSaved)}
                  </strong>
                  <span className="goals-pool-saved-label">
                    נחסך בכל היעדים
                  </span>
                  <div
                    className="goals-pool-saved-meter"
                    aria-hidden
                  >
                    <div
                      className="goals-pool-saved-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (totalSaved /
                              Math.max(
                                totalSaved + Math.max(pool.free, 0),
                                1,
                              )) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <Pulse
        tone={(pool?.free ?? 0) > 0 ? "boost" : "hold"}
        mark={(pool?.free ?? 0) > 0 ? "→" : "♥"}
        label="עידוד להתמדה"
        title={
          (pool?.free ?? 0) > 0
            ? "יש מה להקצות — גם צעד קטן נספר"
            : "אין פנוי כרגע — והמסלול עדיין קיים"
        }
        text={
          (pool?.free ?? 0) > 0
            ? "לא צריך לקפוץ ל־100%. הקצאה שנוח לכם שומרת על מוטיבציה."
            : "כשאין פנוי — מותר לנוח. היעדים מחכים בלי שיפוט."
        }
      />

      {pool && (
        <WinStrip
          items={[
            { label: "פנוי", value: formatIls(pool.free) },
            { label: "הוקצה", value: formatIls(pool.allocated) },
          ]}
        />
      )}

      <FeelRow
        items={[
          {
            emo: "להבין",
            title: "למה הפנוי חשוב",
            text: "מה שנשאר אחרי התחייבויות — זה מרחב בחירה. המוח אוהב לראות שיש כיוון.",
          },
          {
            emo: "להרגיש",
            title: "מה לשמור",
            text: "תקווה ריאלית. לא הבטחות מתוקות — תחושה שיש מסלול שאתם עומדים בו.",
          },
          {
            emo: "לעשות",
            title: "אם נשברת השבוע",
            text: "אל תאפסו יעד. הקטינו את הצעד. חזרה קטנה מחר עדיפה על היעלמות.",
            hold: true,
          },
        ]}
      />

      {!hasEmergency && showReserveCta && !showReserveWizard && (
        <section className="card goals-cushion-cta">
          <div>
            <strong>רזרבה להפתעות</strong>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              סכום שמפרידים מהשוטף כדי לא לחזור למינוס כשמשהו נשבר.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={openReserveWizard}
          >
            התחל רזרבה
          </button>
        </section>
      )}

      {showReserveWizard && !hasEmergency && (
        <form
          className="debt-add-panel compact-form goals-reserve-wizard"
          onSubmit={(e) => {
            e.preventDefault();
            void createReserve(Number(reserveTarget));
          }}
        >
          <p className="debts-totals-eyebrow">רזרבה להפתעות</p>
          <p className="muted debt-wizard-hint">
            סכום שמפרידים מהשוטף כדי לא לחזור למינוס כשמשהו נשבר.
          </p>
          <label className="field">
            <span>סכום יעד</span>
            <input
              type="number"
              min={1}
              step="1"
              value={reserveTarget}
              onChange={(e) => setReserveTarget(e.target.value)}
              required
              autoFocus
            />
          </label>
          <p className="muted debt-wizard-hint">
            הצעה להתחלה — אפשר לשנות. מטרה נפוצה בהמשך: כ־1–3 חודשי הוצאות
            קבועות.
          </p>
          <div className="debt-wizard-nav">
            <button className="btn" type="submit" disabled={busy}>
              יצירת רזרבה
            </button>
            <button
              type="button"
              className="linkish"
              disabled={busy}
              onClick={() => setShowReserveWizard(false)}
            >
              לא עכשיו
            </button>
          </div>
        </form>
      )}

      {showCreate && (
        <form className="card compact-form" onSubmit={onSubmit}>
          <h2 style={{ marginTop: 0 }}>יעד חדש</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            מעקב ידני — עדיין לא חשבון בנק נפרד.
          </p>
          {!hasEmergency && (
            <label className="debt-add-check">
              <input
                type="checkbox"
                checked={createAsReserve}
                onChange={(e) => {
                  const on = e.target.checked;
                  setCreateAsReserve(on);
                  if (on) {
                    setTitle((t) => t.trim() || "רזרבה להפתעות");
                    setTargetAmount(String(suggestedReserveAmount()));
                    setTargetDate("");
                  }
                }}
              />
              <span>
                זה רזרבה להפתעות — סכום שמפרידים מהשוטף להגנה מפני הפתעות
              </span>
            </label>
          )}
          <label className="field">
            <span>שם היעד</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required={!createAsReserve}
              placeholder={
                createAsReserve ? "רזרבה להפתעות" : "למשל: חופשה / רכב"
              }
            />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span>סכום יעד</span>
              <input
                type="number"
                min="1"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>כמה כבר יש</span>
              <input
                type="number"
                min="0"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </label>
          </div>
          {!createAsReserve && (
            <label className="field">
              <span>תאריך יעד (אופציונלי)</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
          )}
          {createAsReserve && (
            <p className="muted debt-wizard-hint">
              הצעה להתחלה — אפשר לשנות. מטרה נפוצה בהמשך: כ־1–3 חודשי הוצאות
              קבועות.
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {createAsReserve ? "שמירת רזרבה" : "שמירת יעד"}
          </button>
        </form>
      )}

      <div className="debts-list-section rise-3">
        <div className="debts-list-heading">
          <h2>מסלול קצר · בלי להציף</h2>
          <span className="muted">
            {sortedGoals.length === 0
              ? "עדיין ריק"
              : sortedGoals.length === 1
                ? "יעד אחד"
                : `${sortedGoals.length} יעדים`}
          </span>
        </div>

        {sortedGoals.length === 0 && (
          <section className="card">
            <p style={{ marginTop: 0 }}>
              אין יעדים לחודש הנבחר. הוסיפו יעד — ואז אפשר להקצות מהפנוי.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => setShowCreate(true)}
            >
              יעד חדש
            </button>
          </section>
        )}

        {sortedGoals.map((g) => {
          const target = Number(g.targetAmount);
          const currentLifetime = Number(g.currentAmount);
          const saved = Number(g.savedAsOfMonth ?? currentLifetime);
          const remainingLifetime = Math.max(0, target - currentLifetime);
          const remainingAsOf = Math.max(0, target - saved);
          const pctRaw = (saved / Math.max(target, 1)) * 100;
          const pct = Math.min(100, Math.round(pctRaw));
          const barPct = Math.min(
            100,
            Math.max(pctRaw < 0.5 && saved > 0 ? 0.5 : pctRaw, 0),
          );
          const savedLine =
            remainingAsOf <= 0
              ? `הושג · ${formatIls(target)}`
              : `${formatIls(saved)} מתוך ${formatIls(target)}`;
          const pctLabel =
            remainingAsOf <= 0
              ? "הושלם"
              : pctRaw < 1
                ? "מתחת לאחוז"
                : `${pct}%`;
          const forecast = forecastLines(g.forecast, Boolean(g.standing));
          const chips = [
            100,
            500,
            Math.round(Math.min(pool?.free || 0, remainingLifetime || 0)),
          ].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
          const needsThisMonthConfirm = Boolean(
            g.standing &&
              g.standing.activeInFocusMonth &&
              !g.doneThisMonth &&
              g.standing.pendingMonths.includes(month),
          );
          const monthDone = Boolean(g.standing && g.doneThisMonth);
          const moreOpen = moreOpenId === g.id;
          const allocateOpen = allocateOpenId === g.id;
          const canManual =
            (pool?.free ?? 0) > 0 && remainingLifetime > 0;
          const isReserve = g.kind === "EMERGENCY";
          const reserveFull = isReserve && remainingLifetime <= 0;
          const quietForecast = isReserve
            ? reserveFull
              ? "הרזרבה מלאה — אפשר להפנות פנוי ליעדים אחרים"
              : "סכום שמפרידים מהשוטף להגנה מפני הפתעות"
            : forecast.find(
                (l) =>
                  l.startsWith("עומדים") ||
                  l.startsWith("באיחור") ||
                  l.includes("כ־"),
              );

          return (
            <article
              key={g.id}
              className={`goals-item${
                isReserve ? " goals-item--cushion" : ""
              }`}
            >
              <div className="goals-item-head">
                <div>
                  <h3>
                    {g.title}
                    {isReserve ? (
                      <span className="badge goals-cushion-badge">רזרבה</span>
                    ) : null}
                  </h3>
                  <p className="goals-item-saved">
                    {savedLine}
                    {pctLabel ? (
                      <span className="muted"> · {pctLabel}</span>
                    ) : null}
                  </p>
                </div>
                {monthDone && (
                  <span className="badge goal-month-done">
                    ✓ {labelMonthHe(month)}
                  </span>
                )}
              </div>

              <div className="goal-progress-track goals-item-bar" aria-hidden>
                <div
                  className="goal-progress-fill"
                  style={{ width: `${barPct}%` }}
                />
              </div>

              {quietForecast && !moreOpen && (
                <p className="muted goals-item-hint">{quietForecast}</p>
              )}

              <div className="goals-item-primary">
                {needsThisMonthConfirm ? (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => openStandingThisMonth(g)}
                  >
                    אשר הקצאת קבע · {formatIls(g.standing!.monthlyAmount)}
                  </button>
                ) : canManual ? (
                  allocateOpen ? null : (
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAllocateOpenId(g.id);
                        setMoreOpenId(null);
                      }}
                    >
                      {isReserve ? "הקצה לרזרבה" : "הקצה מהפנוי"}
                    </button>
                  )
                ) : remainingLifetime <= 0 ? (
                  <span className="muted goals-item-hint">
                    {isReserve
                      ? "הרזרבה מלאה — אפשר ליעדים אחרים"
                      : "היעד מולא"}
                  </span>
                ) : (
                  <span className="muted goals-item-hint">
                    אין פנוי החודש להקצאה ידנית
                  </span>
                )}

                <button
                  type="button"
                  className="linkish"
                  onClick={() =>
                    setMoreOpenId(moreOpen ? null : g.id)
                  }
                >
                  {moreOpen ? "פחות" : "עוד"}
                </button>
              </div>

              {allocateOpen && canManual && (
                <div className="goal-allocate">
                  <div className="goal-chips">
                    {chips.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="trend-chip"
                        onClick={() => {
                          setAmounts((prev) => ({
                            ...prev,
                            [g.id]: String(n),
                          }));
                          openAllocate(g, n);
                        }}
                      >
                        {formatIls(n)}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="סכום"
                    value={amounts[g.id] || ""}
                    onChange={(e) =>
                      setAmounts((prev) => ({
                        ...prev,
                        [g.id]: e.target.value,
                      }))
                    }
                    style={{ width: "6.5rem" }}
                  />
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => openAllocate(g)}
                  >
                    הקצה
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setAllocateOpenId(null)}
                  >
                    סגור
                  </button>
                </div>
              )}

              {moreOpen && (
                <div className="goals-item-more">
                  {g.standing ? (
                    <div className="goal-standing-block">
                      <p className="muted" style={{ margin: 0 }}>
                        {standingSpanLabel(g.standing)} ·{" "}
                        {formatIls(g.standing.monthlyAmount)}/חודש
                      </p>
                      <div className="goal-standing-actions">
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => setStandingPanel(panelFromStanding(g))}
                        >
                          ערוך קבע
                        </button>
                        {!needsThisMonthConfirm &&
                          g.standing.activeInFocusMonth &&
                          !g.doneThisMonth && (
                            <button
                              className="btn secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => openStandingRange(g)}
                            >
                              בצע לטווח…
                            </button>
                          )}
                        <button
                          type="button"
                          className="linkish"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              goalId: g.id,
                              titleHe: g.title,
                              amount: g.standing!.monthlyAmount,
                              month,
                              mode: "stop-standing",
                            })
                          }
                        >
                          הפסק קבע
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => setStandingPanel(panelFromStanding(g))}
                    >
                      הגדר הוראת קבע
                    </button>
                  )}

                  {forecast.length > 0 && (
                    <div className="goal-forecast">
                      {forecast.map((line) => (
                        <p key={line} className="muted">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {g.contributions.length > 0 && (
                    <div className="goal-contribs">
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        הקצאות {labelMonthHe(month)}
                      </div>
                      {g.contributions.map((c) => (
                        <div className="list-row" key={c.id}>
                          <div className="muted">
                            {new Date(c.bookedAt).toLocaleDateString("he-IL")} ·{" "}
                            {formatIls(c.amount)}
                          </div>
                          <button
                            className="btn secondary"
                            type="button"
                            style={{
                              padding: "0.3rem 0.55rem",
                              fontSize: "0.78rem",
                            }}
                            onClick={() =>
                              setConfirm({
                                goalId: g.id,
                                titleHe: g.title,
                                amount: c.amount,
                                month,
                                mode: "reverse",
                                transactionId: c.id,
                              })
                            }
                          >
                            בטל
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="goal-card-tools">
                    <button
                      type="button"
                      className="linkish"
                      disabled={busy}
                      onClick={() =>
                        editingId === g.id ? setEditingId(null) : openEdit(g)
                      }
                    >
                      {editingId === g.id ? "סגור עריכה" : "עריכת יעד"}
                    </button>
                    <button
                      type="button"
                      className="linkish muted"
                      disabled={busy}
                      onClick={() => void removeGoal(g)}
                    >
                      הסרה
                    </button>
                  </div>

                  {editingId === g.id && (
                    <form
                      className="compact-form goal-edit-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEdit(g.id);
                      }}
                    >
                      <label className="field">
                        <span>שם</span>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          required
                        />
                      </label>
                      <div className="grid grid-2">
                        <label className="field">
                          <span>סכום יעד</span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={editTarget}
                            onChange={(e) => setEditTarget(e.target.value)}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>כמה כבר יש</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editCurrent}
                            onChange={(e) => setEditCurrent(e.target.value)}
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>תאריך יעד</span>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                        />
                      </label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn" type="submit" disabled={busy}>
                          שמירה
                        </button>
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          ביטול
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {standingPanel?.goalId === g.id && standingPanelEl}
              {confirm?.goalId === g.id && confirmPanelEl}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<p className="mt-state mt-state-loading">טוען…</p>}>
      <GoalsInner />
    </Suspense>
  );
}
