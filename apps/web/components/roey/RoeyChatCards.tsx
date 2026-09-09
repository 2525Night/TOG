"use client";

import { useState } from "react";
import { api, formatIls } from "@/lib/api";

export type InlineActionProposal = {
  id: string;
  type: string;
  status: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | string;
  requiresDoubleConfirm: boolean;
  expiresAt: string;
  preview: {
    titleHe?: string;
    summaryHe?: string;
    effectHe?: string;
    alternativeHe?: string | null;
    availableBefore?: number | null;
    availableAfter?: number | null;
  };
};

export type InlineEscalation = {
  id: string;
  type: string;
  urgency: string;
  status: string;
  summaryHe: string;
};

export type Citation = {
  factId: string;
  claimHe: string;
  source: string;
};

export type FactUsed = {
  id: string;
  labelHe: string;
  displayHe: string;
  source: string;
};

export type Capability = {
  id: string;
  descriptionHe: string;
  mode: string;
  reasonHe?: string;
};

type ActionProps = {
  proposal: InlineActionProposal;
  busy: boolean;
  onApproved: (updated: InlineActionProposal) => void;
  onRejected: (updated: InlineActionProposal) => void;
  onError: (message: string) => void;
};

type EscalationProps = {
  escalation: InlineEscalation;
  busy: boolean;
  onResolved: (status: "HANDOFF_REQUESTED" | "DISMISSED") => void;
  onError: (message: string) => void;
};

export function RoeyInlineAction({
  proposal,
  busy,
  onApproved,
  onRejected,
  onError,
}: ActionProps) {
  const [phrase, setPhrase] = useState("");
  const [working, setWorking] = useState<"approve" | "reject" | null>(null);
  const expired =
    proposal.status === "PENDING" &&
    new Date(proposal.expiresAt).getTime() <= Date.now();
  const pending = proposal.status === "PENDING" && !expired;
  const severity = String(proposal.severity || "INFO").toLowerCase();

  async function approve() {
    setWorking("approve");
    try {
      const updated = await api<InlineActionProposal>(
        `/roey/actions/${proposal.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            confirm: true,
            confirmationPhrase: proposal.requiresDoubleConfirm
              ? phrase
              : undefined,
          }),
        },
      );
      onApproved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "ביצוע הפעולה נכשל");
    } finally {
      setWorking(null);
    }
  }

  async function reject() {
    setWorking("reject");
    try {
      const updated = await api<InlineActionProposal>(
        `/roey/actions/${proposal.id}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "המשתמש דחה את ההצעה בשיחה" }),
        },
      );
      onRejected(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "דחיית ההצעה נכשלה");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className={`roey-inline-card action ${severity}`}>
      <span className="roey-eyebrow">הצעה לאישור</span>
      <strong>{proposal.preview.titleHe || "פעולה מוצעת"}</strong>
      {proposal.preview.summaryHe && <p>{proposal.preview.summaryHe}</p>}
      {proposal.preview.effectHe && (
        <p className="roey-inline-effect">{proposal.preview.effectHe}</p>
      )}
      {proposal.preview.availableBefore != null &&
        proposal.preview.availableAfter != null && (
          <div className="roey-action-impact">
            <span>
              לפני{" "}
              <strong>{formatIls(proposal.preview.availableBefore)}</strong>
            </span>
            <span aria-hidden="true">←</span>
            <span>
              אחרי{" "}
              <strong
                className={
                  proposal.preview.availableAfter < 0 ? "negative" : ""
                }
              >
                {formatIls(proposal.preview.availableAfter)}
              </strong>
            </span>
          </div>
        )}
      {proposal.preview.alternativeHe && (
        <p className="roey-action-alternative">
          חלופה בטוחה יותר: {proposal.preview.alternativeHe}
        </p>
      )}
      <small className="roey-action-expiry">
        {pending
          ? `בתוקף עד ${new Date(proposal.expiresAt).toLocaleTimeString("he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : actionStatusHe(expired ? "EXPIRED" : proposal.status)}
      </small>
      {pending && (
        <div className="roey-inline-controls">
          {proposal.requiresDoubleConfirm && (
            <label className="field">
              <span>לאישור הקלידו: אני מאשר את ההשפעה</span>
              <input
                name={`inline-confirm-${proposal.id}`}
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
              />
            </label>
          )}
          <div>
            <button
              className={severity === "critical" ? "btn danger" : "btn"}
              type="button"
              disabled={
                busy ||
                working != null ||
                (proposal.requiresDoubleConfirm &&
                  phrase.trim() !== "אני מאשר את ההשפעה")
              }
              onClick={() => void approve()}
            >
              {working === "approve" ? "מבצע…" : "אישור וביצוע"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy || working != null}
              onClick={() => void reject()}
            >
              {working === "reject" ? "דוחה…" : "דחייה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoeyInlineEscalation({
  escalation,
  busy,
  onResolved,
  onError,
}: EscalationProps) {
  const [working, setWorking] = useState<"handoff" | "dismiss" | null>(null);
  const open = escalation.status === "OPEN";

  async function handle(action: "approve-handoff" | "dismiss") {
    setWorking(action === "dismiss" ? "dismiss" : "handoff");
    try {
      await api(`/roey/escalations/${escalation.id}/${action}`, {
        method: "POST",
      });
      onResolved(action === "dismiss" ? "DISMISSED" : "HANDOFF_REQUESTED");
    } catch (err) {
      onError(err instanceof Error ? err.message : "עדכון ההסלמה נכשל");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className={`roey-inline-card escalation ${escalation.urgency.toLowerCase()}`}>
      <span className="roey-eyebrow">נדרשת מעורבות אנושית</span>
      <strong>{escalation.summaryHe}</strong>
      <small>{urgencyHe(escalation.urgency)} · {escalationTypeHe(escalation.type)}</small>
      {open ? (
        <div className="roey-inline-controls">
          <div>
            <button
              className="btn"
              type="button"
              disabled={busy || working != null}
              onClick={() => void handle("approve-handoff")}
            >
              {working === "handoff" ? "מעביר…" : "אישור העברה לאדם"}
            </button>
            <button
              className="btn quiet"
              type="button"
              disabled={busy || working != null}
              onClick={() => void handle("dismiss")}
            >
              {working === "dismiss" ? "מסיר…" : "הסרה"}
            </button>
          </div>
        </div>
      ) : (
        <small>{escalation.status === "HANDOFF_REQUESTED" ? "הועבר לבדיקה אנושית" : "הוסר"}</small>
      )}
    </div>
  );
}

export function RoeyCitations({
  citations,
  facts,
  capabilities,
}: {
  citations: Citation[];
  facts: FactUsed[];
  capabilities?: Capability[];
}) {
  const unavailable = (capabilities || []).filter(
    (item) => item.mode === "UNAVAILABLE",
  );
  const rows =
    citations.length > 0
      ? citations
      : facts.map((fact) => ({
          factId: fact.id,
          claimHe: `${fact.labelHe}: ${fact.displayHe}`,
          source: fact.source,
        }));

  return (
    <details className="roey-sources">
      <summary>על אילו נתונים הסתמכתי?</summary>
      {rows.length > 0 ? (
        <ul className="roey-citation-list">
          {rows.map((citation) => (
            <li key={`${citation.factId}-${citation.claimHe}`}>
              <span>{citation.claimHe}</span>
              <small>{sourceHe(citation.source)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">אין ציטוטים זמינים לתשובה הזו.</p>
      )}
      {unavailable.length > 0 && (
        <div className="roey-limits">
          <strong>גבולות המערכת</strong>
          <ul>
            {unavailable.map((item) => (
              <li key={item.id}>
                {item.descriptionHe}
                {item.reasonHe ? ` — ${item.reasonHe}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

export function actionStatusHe(status: string) {
  if (status === "PENDING") return "ממתין לאישור";
  if (status === "EXECUTED") return "בוצע";
  if (status === "REJECTED") return "נדחה";
  if (status === "FAILED") return "נכשל";
  if (status === "EXPIRED") return "פג תוקף";
  return "אושר";
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

function sourceHe(source: string) {
  if (source === "MONEYTAIL") return "MoneyTail";
  if (source === "BANK_OF_ISRAEL") return "בנק ישראל";
  if (source === "CBS") return "הלמ״ס";
  return source;
}
