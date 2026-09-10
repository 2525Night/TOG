"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatIls } from "@/lib/api";

type Milestone = {
  id?: string;
  titleHe: string;
  targetAmount: number | null;
  targetDate: string | null;
  status?: string;
  progressPct?: number;
};

type Constraint = {
  id?: string;
  type: string;
  labelHe: string;
  value?: unknown;
  hard: boolean;
};

type Plan = {
  id: string;
  version: number;
  objectiveHe: string;
  motivationHe: string | null;
  priority: string;
  horizonMonths: number | null;
  riskCapacity: string;
  nextActionHe: string | null;
  reviewAt: string | null;
  milestones: Milestone[];
  constraints: Constraint[];
  assumptions: string[];
  reviewTriggers: string[];
  events: Array<{
    id: string;
    version: number;
    type: string;
    summaryHe: string;
    reasonHe: string | null;
    createdAt: string;
  }>;
};

type MemoryItem = {
  id: string;
  key: string;
  value: { textHe?: string } | null;
  userConfirmed: boolean;
  updatedAt: string;
};

type Escalation = {
  id: string;
  type: string;
  urgency: string;
  status: string;
  summaryHe: string;
  createdAt: string;
};

type Outcome = {
  id: string;
  type: string;
  status: string;
  dueAt: string;
  reconciledAt: string | null;
  varianceJson: string | null;
};

const EMPTY = {
  objectiveHe: "",
  motivationHe: "",
  priority: "STABILITY",
  horizonMonths: "12",
  riskCapacity: "CONSERVATIVE",
  nextActionHe: "",
  reviewAt: "",
};

export function RoeyPlanPanel() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [minAvailable, setMinAvailable] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryText, setMemoryText] = useState("");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [planResult, nextMemories, nextEscalations, nextOutcomes] =
        await Promise.all([
          api<{ plan: Plan | null; suggested: Partial<Plan> | null }>(
            "/roey/plan",
          ),
          api<MemoryItem[]>("/roey/memory"),
          api<Escalation[]>("/roey/escalations"),
          api<Outcome[]>("/roey/outcomes"),
        ]);
      setPlan(planResult.plan);
      const source = planResult.plan || planResult.suggested;
      setForm({
        objectiveHe: source?.objectiveHe || "",
        motivationHe: planResult.plan?.motivationHe || "",
        priority: source?.priority || "STABILITY",
        horizonMonths: String(planResult.plan?.horizonMonths || 12),
        riskCapacity: planResult.plan?.riskCapacity || "CONSERVATIVE",
        nextActionHe: planResult.plan?.nextActionHe || "",
        reviewAt: planResult.plan?.reviewAt?.slice(0, 10) || "",
      });
      setMilestones(planResult.plan?.milestones || []);
      const minimum = planResult.plan?.constraints.find(
        (constraint) => constraint.type === "MIN_AVAILABLE",
      );
      setMinAvailable(
        minimum && typeof minimum.value === "number"
          ? String(minimum.value)
          : "",
      );
      setMemories(nextMemories);
      setEscalations(nextEscalations);
      setOutcomes(nextOutcomes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת המסע נכשלה");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    setBusy("plan");
    setError(null);
    setSuccess(null);
    try {
      const result = await api<{ plan: Plan }>("/roey/plan", {
        method: "PATCH",
        body: JSON.stringify({
          objectiveHe: form.objectiveHe,
          motivationHe: form.motivationHe || undefined,
          priority: form.priority,
          horizonMonths: Number(form.horizonMonths) || undefined,
          riskCapacity: form.riskCapacity,
          nextActionHe: form.nextActionHe || undefined,
          reviewAt: form.reviewAt
            ? new Date(`${form.reviewAt}T12:00:00`).toISOString()
            : undefined,
          milestones: milestones
            .filter((item) => item.titleHe.trim())
            .map((item) => ({
              titleHe: item.titleHe,
              targetAmount: item.targetAmount || undefined,
              targetDate: item.targetDate
                ? new Date(`${item.targetDate.slice(0, 10)}T12:00:00`).toISOString()
                : undefined,
            })),
          constraints: minAvailable
            ? [
                {
                  type: "MIN_AVAILABLE",
                  labelHe: "זמין מינימלי מוגן",
                  value: Number(minAvailable),
                  hard: true,
                },
              ]
            : [],
        }),
      });
      setPlan(result.plan);
      setSuccess("התוכנית הפיננסית נשמרה כגרסה חדשה.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת התוכנית נכשלה");
    } finally {
      setBusy(null);
    }
  }

  async function reviewPlan() {
    setBusy("review");
    setError(null);
    setSuccess(null);
    try {
      await api("/roey/plan/review", {
        method: "POST",
        body: JSON.stringify({
          summaryHe: "המשתמש סימן שהתוכנית נבדקה מול המצב הנוכחי.",
          nextReviewAt: form.reviewAt
            ? new Date(`${form.reviewAt}T12:00:00`).toISOString()
            : undefined,
        }),
      });
      setSuccess("התוכנית סומנה כנבדקה.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הבדיקה נכשל");
    } finally {
      setBusy(null);
    }
  }

  async function addMemory(event: FormEvent) {
    event.preventDefault();
    if (!memoryText.trim()) return;
    setBusy("memory");
    setError(null);
    try {
      await api("/roey/memory", {
        method: "POST",
        body: JSON.stringify({
          key: `user-note-${Date.now()}`,
          valueHe: memoryText.trim(),
          userConfirmed: true,
        }),
      });
      setMemoryText("");
      setSuccess("הפרט נוסף לזיכרון המאושר.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הזיכרון נכשלה");
    } finally {
      setBusy(null);
    }
  }

  async function forgetMemory(id: string) {
    setBusy(id);
    try {
      await api(`/roey/memory/${id}`, { method: "DELETE" });
      setMemories((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקת הזיכרון נכשלה");
    } finally {
      setBusy(null);
    }
  }

  async function handleEscalation(
    id: string,
    action: "approve-handoff" | "dismiss",
  ) {
    setBusy(id);
    try {
      await api(`/roey/escalations/${id}/${action}`, { method: "POST" });
      setEscalations((current) => current.filter((item) => item.id !== id));
      setSuccess(
        action === "approve-handoff"
          ? "בקשת העברה לאדם אושרה."
          : "בקשת ההסלמה הוסרה.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון ההסלמה נכשל");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="roey-plan-grid">
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      <form className="card roey-plan-form" onSubmit={savePlan}>
        <span className="roey-eyebrow">תוכנית חיה</span>
        <h2>{plan ? `גרסה ${plan.version}` : "בניית מסלול ראשון"}</h2>
        <label className="field">
          <span>מה היעד המרכזי?</span>
          <textarea
            name="objectiveHe"
            rows={2}
            required
            minLength={2}
            maxLength={500}
            value={form.objectiveHe}
            onChange={(event) =>
              setForm({ ...form, objectiveHe: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>למה זה חשוב לך?</span>
          <textarea
            name="motivationHe"
            rows={2}
            maxLength={1_000}
            value={form.motivationHe}
            onChange={(event) =>
              setForm({ ...form, motivationHe: event.target.value })
            }
          />
        </label>
        <div className="roey-plan-fields">
          <label className="field">
            <span>עדיפות</span>
            <select
              name="priority"
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value })
              }
            >
              <option value="STABILITY">יציבות</option>
              <option value="DEBT_REDUCTION">צמצום אשראי והלוואות</option>
              <option value="EMERGENCY_BUFFER">כרית ביטחון</option>
              <option value="SAVING_GOAL">יעד חיסכון</option>
              <option value="CASHFLOW">שיפור תזרים</option>
            </select>
          </label>
          <label className="field">
            <span>קיבולת סיכון</span>
            <select
              name="riskCapacity"
              value={form.riskCapacity}
              onChange={(event) =>
                setForm({ ...form, riskCapacity: event.target.value })
              }
            >
              <option value="CONSERVATIVE">שמרנית</option>
              <option value="BALANCED">מאוזנת</option>
            </select>
          </label>
          <label className="field">
            <span>אופק בחודשים</span>
            <input
              name="horizonMonths"
              type="number"
              min="1"
              max="360"
              value={form.horizonMonths}
              onChange={(event) =>
                setForm({ ...form, horizonMonths: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>זמין מינימלי מוגן</span>
            <input
              name="minAvailable"
              type="number"
              min="0"
              inputMode="decimal"
              value={minAvailable}
              onChange={(event) => setMinAvailable(event.target.value)}
            />
          </label>
          <label className="field">
            <span>תאריך בדיקה הבא</span>
            <input
              name="reviewAt"
              type="date"
              value={form.reviewAt}
              onChange={(event) =>
                setForm({ ...form, reviewAt: event.target.value })
              }
            />
          </label>
        </div>
        <label className="field">
          <span>הצעד הבא</span>
          <input
            name="nextActionHe"
            maxLength={500}
            value={form.nextActionHe}
            onChange={(event) =>
              setForm({ ...form, nextActionHe: event.target.value })
            }
          />
        </label>

        <div className="roey-milestones">
          <div className="roey-plan-section-head">
            <h3>אבני דרך</h3>
            <button
              className="btn quiet"
              type="button"
              onClick={() =>
                setMilestones((current) => [
                  ...current,
                  { titleHe: "", targetAmount: null, targetDate: null },
                ])
              }
            >
              הוספה
            </button>
          </div>
          {milestones.map((milestone, index) => (
            <div className="roey-milestone-row" key={milestone.id || index}>
              <span className="roey-milestone-index" aria-hidden="true">
                {index + 1}
              </span>
              <input
                aria-label="שם אבן דרך"
                placeholder="שם אבן הדרך"
                value={milestone.titleHe}
                onChange={(event) =>
                  setMilestones((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, titleHe: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <input
                aria-label="סכום יעד"
                type="number"
                min="0"
                placeholder="סכום"
                value={milestone.targetAmount ?? ""}
                onChange={(event) =>
                  setMilestones((current) =>
                    current.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            targetAmount: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : item,
                    ),
                  )
                }
              />
              <input
                aria-label="תאריך יעד"
                type="date"
                value={milestone.targetDate?.slice(0, 10) || ""}
                onChange={(event) =>
                  setMilestones((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, targetDate: event.target.value || null }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label="הסרת אבן דרך"
                onClick={() =>
                  setMilestones((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button className="btn" type="submit" disabled={busy === "plan"}>
          {busy === "plan" ? "שומר גרסה…" : "שמירת התוכנית"}
        </button>
        {plan && (
          <button
            className="btn secondary"
            type="button"
            disabled={busy === "review"}
            onClick={() => void reviewPlan()}
          >
            {busy === "review" ? "מעדכן בדיקה…" : "סימון שהתוכנית נבדקה"}
          </button>
        )}
        {plan?.reviewTriggers && plan.reviewTriggers.length > 0 && (
          <p className="field-hint">
            בדיקה מחדש נפתחת כש: {plan.reviewTriggers.join(" · ")}
          </p>
        )}
      </form>

      <section className="roey-plan-side">
        {plan && plan.milestones.length > 0 && (
          <div className="card roey-milestone-timeline">
            <span className="roey-eyebrow">ציר אבני הדרך</span>
            <h2>איך המסלול בנוי</h2>
            <ol>
              {plan.milestones.map((milestone) => (
                <li key={milestone.id || milestone.titleHe}>
                  <strong>{milestone.titleHe}</strong>
                  <span>
                    {milestone.targetAmount != null
                      ? formatIls(milestone.targetAmount)
                      : "בלי סכום יעד"}
                    {milestone.targetDate
                      ? ` · ${new Date(milestone.targetDate).toLocaleDateString("he-IL")}`
                      : ""}
                  </span>
                  <small>
                    {milestoneStatusHe(milestone.status)}
                    {milestone.progressPct
                      ? ` · ${milestone.progressPct}%`
                      : ""}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="card">
          <span className="roey-eyebrow">זיכרון מאושר</span>
          <h2>מה Roey רשאי לזכור</h2>
          <form className="roey-memory-add" onSubmit={addMemory}>
            <input
              aria-label="מידע לזיכרון"
              placeholder="למשל: חשוב לי לא לפגוע בכרית הביטחון"
              value={memoryText}
              maxLength={1_000}
              onChange={(event) => setMemoryText(event.target.value)}
            />
            <button className="btn" disabled={busy === "memory"}>
              שמירה
            </button>
          </form>
          <div className="roey-memory-list">
            {memories.map((memory) => (
              <div key={memory.id}>
                <span>{memory.value?.textHe || memory.key}</span>
                <button
                  type="button"
                  disabled={busy === memory.id}
                  onClick={() => void forgetMemory(memory.id)}
                >
                  מחיקה
                </button>
              </div>
            ))}
            {memories.length === 0 && (
              <p className="muted">אין כרגע פריטי זיכרון מאושרים.</p>
            )}
          </div>
        </div>

        {escalations.length > 0 && (
          <div className="card roey-escalations">
            <span className="roey-eyebrow">נדרשת מעורבות אנושית</span>
            {escalations.map((item) => (
              <article key={item.id}>
                <strong>{item.summaryHe}</strong>
                <small>
                  {urgencyHe(item.urgency)} · {escalationTypeHe(item.type)}
                </small>
                <div>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() =>
                      void handleEscalation(item.id, "approve-handoff")
                    }
                  >
                    אישור העברה
                  </button>
                  <button
                    className="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void handleEscalation(item.id, "dismiss")}
                  >
                    הסרה
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {plan?.events && plan.events.length > 0 && (
          <div className="card roey-plan-timeline">
            <span className="roey-eyebrow">ציר התוכנית</span>
            <h2>למה המסלול השתנה?</h2>
            {plan.events.map((event) => (
              <article key={event.id}>
                <span>
                  גרסה {event.version} · {eventTypeHe(event.type)}
                </span>
                <strong>{event.summaryHe}</strong>
                {event.reasonHe && <p>{event.reasonHe}</p>}
                <small>
                  {new Date(event.createdAt).toLocaleDateString("he-IL")}
                </small>
              </article>
            ))}
          </div>
        )}

        {outcomes.length > 0 && (
          <div className="card roey-outcomes">
            <span className="roey-eyebrow">בדיקת תוצאות</span>
            <h2>ציפייה מול מציאות</h2>
            {outcomes.slice(0, 8).map((outcome) => (
              <div key={outcome.id}>
                <strong>{outcome.type === "FORECAST_DAY_30" ? "תחזית 30 יום" : "פעולה"}</strong>
                <span>{outcomeStatusHe(outcome.status)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function outcomeStatusHe(status: string) {
  if (status === "MATCHED") return "אומת";
  if (status === "DIVERGED") return "נדרש עדכון";
  return "ממתין לבדיקה";
}

function milestoneStatusHe(status?: string) {
  if (status === "DONE") return "הושלם";
  if (status === "IN_PROGRESS") return "בתהליך";
  return "ממתין";
}

function eventTypeHe(type: string) {
  if (type === "PLAN_CREATED") return "יצירה";
  if (type === "PLAN_UPDATED") return "עדכון";
  if (type === "PLAN_REVIEWED") return "בדיקה מחדש";
  if (type === "PLAN_FLAGGED") return "סטייה מהתחזית";
  return type;
}

function urgencyHe(value: string) {
  if (value === "URGENT") return "דחוף";
  if (value === "HIGH") return "גבוה";
  return "רגיל";
}

function escalationTypeHe(value: string) {
  if (value === "VULNERABILITY") return "פגיעוּת";
  if (value === "REGULATED_GUIDANCE") return "נושא מוסדר";
  if (value === "DATA_DISPUTE") return "מחלוקת נתונים";
  return value;
}
