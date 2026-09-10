"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, formatIls } from "@/lib/api";
import { ConfirmPanel } from "@/components/ConfirmPanel";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect, useSelectedMonth } from "@/components/PeriodBar";
import { RoeyActionsPanel } from "@/components/roey/RoeyActionsPanel";
import {
  RoeyCitations,
  RoeyInlineAction,
  RoeyInlineEscalation,
  type InlineActionProposal,
} from "@/components/roey/RoeyChatCards";
import { RoeyPlanPanel } from "@/components/roey/RoeyPlanPanel";

type ModelOption = {
  id: string;
  displayName: string;
  description: string;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
};

type Connection = {
  connected: boolean;
  provider?: string;
  keyHint?: string;
  modelId?: string | null;
  status?: string;
  lastValidatedAt?: string | null;
  platformManaged?: boolean;
};

type Journey = {
  stage: "INTRODUCTION" | "BASELINE" | "ESTABLISHED" | "RETURNING";
  titleHe: string;
  messageHe: string;
  completedMonths: number;
  reliableMonths: number;
  signalsReliable: boolean;
};

type Profile = {
  primaryGoal: string | null;
  tone: "CONCISE" | "BALANCED" | "EXPLANATORY";
  assertiveness: "GENTLE" | "BALANCED" | "ASSERTIVE";
  notificationMode: "OFF" | "IMPORTANT_ONLY" | "WEEKLY";
  memoryEnabled: boolean;
  onboardingSeen: boolean;
  journey: Journey;
};

type Forecast = {
  confidence: "LOW" | "MEDIUM" | "HIGH";
  startingAvailable: number;
  assumptionsHe: string[];
  marketContext?: {
    policyRatePct: number | null;
    annualCpiPct: number | null;
    observedAt: string | null;
    sourceNames: string[];
  };
  scenarios: Array<{
    id: "POSITIVE" | "BASE" | "STRESS";
    labelHe: string;
    monthlyIncome: number;
    monthlyExpenses: number;
    points: Array<{ days: 30 | 60 | 90; projectedAvailable: number }>;
  }>;
};

type Risk = {
  severity: "INFO" | "WARNING" | "CRITICAL";
  titleHe: string;
  messageHe: string;
  amountIls: number | null;
  horizonDays: number | null;
};

type Fact = {
  id: string;
  labelHe: string;
  displayHe: string;
  source: string;
};

type ChatResponse = {
  conversationId: string | null;
  severity: Risk["severity"];
  modelId: string;
  message: {
    messageHe: string;
    recommendationHe: string | null;
    alternativesHe: string[];
    questionHe: string | null;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  };
  risk: Risk;
  journey: Journey;
  factsUsed: Fact[];
  forecast: Forecast;
  agent?: {
    runId: string;
    intent: string;
    citations: Array<{
      factId: string;
      claimHe: string;
      source: string;
    }>;
    capabilities: Array<{
      id: string;
      descriptionHe: string;
      mode: string;
      reasonHe?: string;
    }>;
  };
  actionProposal?: InlineActionProposal | null;
  escalation?: {
    id: string;
    type: string;
    urgency: string;
    status: string;
    summaryHe: string;
  } | null;
};

type ChatItem =
  | { id: string; role: "USER"; content: string }
  | {
      id: string;
      role: "ASSISTANT";
      content: string;
      response?: ChatResponse;
    };

type SavedSession = {
  id: string;
  titleHe: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages?: Array<{
    id: string;
    role: "USER" | "ASSISTANT";
    contentHe: string;
    severity: Risk["severity"] | null;
    confidence: "LOW" | "MEDIUM" | "HIGH" | null;
    createdAt: string;
    payload: ChatResponse | null;
  }>;
};

type RoeyNudge = {
  id: string;
  titleHe: string;
  bodyHe: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  href: string | null;
  createdAt: string;
};

const QUICK_PROMPTS = [
  "מה מצב החודש שלי?",
  "מה מסכן אותי כרגע?",
  "מה הצעד הבא שכדאי לי לעשות?",
  "תציג לי תחזית ל-90 יום",
];

function RoeyPageInner() {
  const month = useSelectedMonth();
  const [tab, setTab] = useState<"CHAT" | "PLAN" | "ACTIONS" | "SETTINGS">(
    "CHAT",
  );
  const [connection, setConnection] = useState<Connection | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [nudges, setNudges] = useState<RoeyNudge[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const nextSessions = await api<SavedSession[]>("/roey/conversations");
    setSessions(nextSessions);
    return nextSessions;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConnection, nextProfile, nextNudges] = await Promise.all([
        api<Connection>("/roey/connections/google-ai-studio"),
        api<Profile>("/roey/profile"),
        api<RoeyNudge[]>("/roey/nudges"),
      ]);
      setConnection(nextConnection);
      setProfile(nextProfile);
      setNudges(nextNudges);
      if (nextConnection.connected) {
        const forecastResult = await api<{ forecast: Forecast; risk: Risk }>(
          `/roey/forecast?month=${encodeURIComponent(month)}`,
        );
        setForecast(forecastResult.forecast);
        setRisk(forecastResult.risk);
        if (nextProfile.memoryEnabled) {
          setSessions(await api<SavedSession[]>("/roey/conversations"));
        } else {
          setSessions([]);
        }
        try {
          const modelResult = await api<{
            models: ModelOption[];
            selectedModelId: string | null;
          }>("/roey/connections/models");
          setModels(modelResult.models);
          if (modelResult.selectedModelId) {
            setConnection((current) =>
              current
                ? { ...current, modelId: modelResult.selectedModelId }
                : current,
            );
          }
        } catch (modelErr) {
          setModels([]);
          setError(
            modelErr instanceof Error
              ? modelErr.message
              : "לא ניתן לטעון את רשימת המודלים",
          );
        }
      } else {
        setModels([]);
        setForecast(null);
        setRisk(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לטעון את Roey");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api<
        Connection & { models: ModelOption[] }
      >("/roey/connections/google-ai-studio", {
        method: "POST",
        body: JSON.stringify({ apiKey, consent }),
      });
      setConnection(result);
      setModels(result.models);
      setApiKey("");
      setConsent(false);
      setSuccess("החיבור ל-Google AI Studio הצליח");
      const forecastResult = await api<{ forecast: Forecast; risk: Risk }>(
        `/roey/forecast?month=${encodeURIComponent(month)}`,
      );
      setForecast(forecastResult.forecast);
      setRisk(forecastResult.risk);
    } catch (err) {
      setError(err instanceof Error ? err.message : "החיבור נכשל");
    } finally {
      setBusy(false);
    }
  }

  async function selectModel(modelId: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/roey/connections/model", {
        method: "PATCH",
        body: JSON.stringify({ modelId }),
      });
      setConnection((current) =>
        current ? { ...current, modelId } : current,
      );
      setSuccess("המודל עודכן");
    } catch (err) {
      setError(err instanceof Error ? err.message : "בחירת המודל נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Omit<Profile, "journey">>("/roey/profile", {
        method: "PATCH",
        body: JSON.stringify({
          primaryGoal: profile.primaryGoal || "",
          tone: profile.tone,
          assertiveness: profile.assertiveness,
          notificationMode: profile.notificationMode,
          memoryEnabled: profile.memoryEnabled,
          onboardingSeen: true,
        }),
      });
      setProfile((current) =>
        current ? { ...current, ...updated, onboardingSeen: true } : current,
      );
      if (!updated.memoryEnabled) {
        setSessions([]);
        setMessages([]);
        setConversationId(null);
      } else {
        await loadSessions();
      }
      setSuccess("העדפות Roey נשמרו");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת ההעדפות נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api("/roey/connections/google-ai-studio", { method: "DELETE" });
      setDisconnectOpen(false);
      setMessages([]);
      setConversationId(null);
      setSuccess("המפתח האישי נמחק. אם יש מפתח מובנה — Roey נשאר מחובר.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הניתוק נכשל");
    } finally {
      setBusy(false);
    }
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || !connection?.connected) return;
    const userItem: ChatItem = {
      id: `user-${Date.now()}`,
      role: "USER",
      content: trimmed,
    };
    setMessages((current) => [...current, userItem]);
    setMessage("");
    setBusy(true);
    setError(null);
    try {
      const response = await api<ChatResponse>("/roey/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          conversationId: conversationId || undefined,
          month,
        }),
      });
      setConversationId(response.conversationId);
      setForecast(response.forecast);
      setRisk(response.risk);
      setProfile((current) =>
        current ? { ...current, journey: response.journey } : current,
      );
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "ASSISTANT",
          content: response.message.messageHe,
          response,
        },
      ]);
      if (profile?.memoryEnabled) await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Roey לא הצליח לענות");
    } finally {
      setBusy(false);
    }
  }

  function startNewSession() {
    setConversationId(null);
    setMessages([]);
    setSessionsOpen(false);
    setError(null);
    setSuccess("נפתח סשן חדש. הסשן הקודם נשמר ברשימה.");
  }

  async function openSession(session: SavedSession) {
    setBusy(true);
    setError(null);
    try {
      const detail = await api<SavedSession>(
        `/roey/conversations/${session.id}`,
      );
      setConversationId(session.id);
      setMessages(
        (detail.messages || []).map((saved) =>
        saved.role === "USER"
          ? {
              id: saved.id,
              role: "USER" as const,
              content: saved.contentHe,
            }
          : {
              id: saved.id,
              role: "ASSISTANT" as const,
              content: saved.contentHe,
              response: saved.payload
                ? restoreChatResponse(saved.payload, session.id)
                : undefined,
            },
        ),
      );
      setSessionsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הסשן נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession() {
    if (!deleteSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/roey/conversations/${deleteSessionId}`, {
        method: "DELETE",
      });
      if (conversationId === deleteSessionId) {
        setConversationId(null);
        setMessages([]);
      }
      setDeleteSessionId(null);
      await loadSessions();
      setSuccess("הסשן נמחק.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקת הסשן נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function refreshForecast() {
    try {
      const forecastResult = await api<{ forecast: Forecast; risk: Risk }>(
        `/roey/forecast?month=${encodeURIComponent(month)}`,
      );
      setForecast(forecastResult.forecast);
      setRisk(forecastResult.risk);
    } catch {
      // The chat answer already reflects the latest known state.
    }
  }

  function updateAssistantProposal(
    messageId: string,
    updated: InlineActionProposal,
  ) {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId && item.role === "ASSISTANT" && item.response
          ? {
              ...item,
              response: { ...item.response, actionProposal: updated },
            }
          : item,
      ),
    );
  }

  function updateAssistantEscalation(
    messageId: string,
    status: "HANDOFF_REQUESTED" | "DISMISSED",
  ) {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId && item.role === "ASSISTANT" && item.response
          ? {
              ...item,
              response: item.response.escalation
                ? {
                    ...item.response,
                    escalation: { ...item.response.escalation, status },
                  }
                : item.response,
            }
          : item,
      ),
    );
  }

  async function handleNudge(id: string, action: "dismiss" | "snooze") {
    setBusy(true);
    setError(null);
    try {
      await api(`/roey/nudges/${id}/${action}`, { method: "POST" });
      setNudges((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון ההתראה נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="muted">Roey מתכונן…</p>;
  }

  return (
    <div className="roey-page">
      <PageHeader
        kicker="המלווה הפיננסי שלך"
        title="Roey"
        subtitle="מבין את התמונה, משקף סיכון ומלווה אותך לצעד הבא."
        actions={<MonthSelect className="roey-month-select" />}
      />

      {nudges.length > 0 && (
        <section className="roey-nudge-list" aria-label="עדכונים מ-Roey">
          {nudges.map((nudge) => (
            <article
              className={`card roey-nudge ${nudge.severity.toLowerCase()}`}
              key={nudge.id}
            >
              <div>
                <span className="roey-eyebrow">Roey שם לב</span>
                <h2>{nudge.titleHe}</h2>
                <p>{nudge.bodyHe}</p>
              </div>
              <div className="roey-nudge-actions">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleNudge(nudge.id, "snooze")}
                >
                  הזכר לי בעוד שבוע
                </button>
                <button
                  className="btn quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleNudge(nudge.id, "dismiss")}
                >
                  הסרה
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {profile?.journey && (
        <section className="roey-journey card">
          <div className="roey-avatar" aria-hidden="true">R</div>
          <div>
            <span className="roey-eyebrow">השלב שלך במסע</span>
            <h2>{profile.journey.titleHe}</h2>
            <p>{profile.journey.messageHe}</p>
          </div>
        </section>
      )}

      <div className="roey-tabs" role="tablist" aria-label="Roey">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "CHAT"}
          className={tab === "CHAT" ? "active" : ""}
          onClick={() => setTab("CHAT")}
        >
          שיחה
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "PLAN"}
          className={tab === "PLAN" ? "active" : ""}
          onClick={() => setTab("PLAN")}
        >
          מסע
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ACTIONS"}
          className={tab === "ACTIONS" ? "active" : ""}
          onClick={() => setTab("ACTIONS")}
        >
          פעולות
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "SETTINGS"}
          className={tab === "SETTINGS" ? "active" : ""}
          onClick={() => setTab("SETTINGS")}
        >
          הגדרות
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      {tab === "CHAT" ? (
        <section className="roey-workspace">
          {!connection?.connected ? (
            <div className="card roey-connect-callout">
              <span className="roey-eyebrow">נדרש חיבור חד־פעמי</span>
              <h2>חברו את Roey ל-Google AI Studio</h2>
              <p className="muted">
                המפתח נשמר מוצפן בשרת ולעולם אינו נשמר בטלפון.
              </p>
              <button className="btn" type="button" onClick={() => setTab("SETTINGS")}>
                להגדרת החיבור
              </button>
            </div>
          ) : (
            <>
              {connection.platformManaged ? (
                <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                  Roey מחובר במפתח מובנה של MoneyTail5 — אפשר להתחיל לדבר בלי
                  הגדרות. בהגדרות אפשר לחבר מפתח אישי במקום.
                </p>
              ) : null}
              <div className="roey-chat card">
                <div className="roey-session-toolbar">
                  {profile?.memoryEnabled ? (
                    <>
                      <button
                        className="btn quiet"
                        type="button"
                        aria-expanded={sessionsOpen}
                        onClick={() => setSessionsOpen((current) => !current)}
                      >
                        סשנים שמורים ({sessions.length})
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={startNewSession}
                      >
                        סשן חדש
                      </button>
                    </>
                  ) : (
                    <span className="muted">
                      הזיכרון כבוי — השיחה הנוכחית לא תישמר.
                    </span>
                  )}
                </div>

                {sessionsOpen && profile?.memoryEnabled && (
                  <aside className="roey-session-panel" aria-label="סשנים שמורים">
                    {sessions.length === 0 ? (
                      <p className="muted">עדיין אין סשנים שמורים.</p>
                    ) : (
                      sessions.map((session) => (
                        <div
                          className={`roey-session-row${conversationId === session.id ? " active" : ""}`}
                          key={session.id}
                        >
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void openSession(session)}
                          >
                            <strong>{session.titleHe || "שיחה עם Roey"}</strong>
                            <small>
                              {new Date(session.updatedAt).toLocaleDateString(
                                "he-IL",
                                { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
                              )}
                              {" · "}
                              {session.messageCount} הודעות
                            </small>
                          </button>
                          <button
                            className="roey-session-delete"
                            type="button"
                            aria-label="מחיקת הסשן"
                            onClick={() => setDeleteSessionId(session.id)}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </aside>
                )}

                {messages.length === 0 && (
                  <div className="roey-welcome">
                    <div className="roey-avatar large" aria-hidden="true">R</div>
                    <h2>במה נתחיל?</h2>
                    <p className="muted">
                      אני משתמש רק בנתונים המחושבים של MoneyTail5 ומציין כשהתמונה חלקית.
                    </p>
                    <div className="roey-prompts">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          type="button"
                          key={prompt}
                          disabled={busy}
                          onClick={() => void ask(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="roey-messages" aria-live="polite">
                  {messages.map((item) =>
                    item.role === "USER" ? (
                      <article className="roey-message user" key={item.id}>
                        <span>אתה</span>
                        <p>{item.content}</p>
                      </article>
                    ) : (
                      <AssistantMessage
                        key={item.id}
                        item={item}
                        busy={busy}
                        onActionUpdated={(updated) =>
                          updateAssistantProposal(item.id, updated)
                        }
                        onEscalationResolved={(status) =>
                          updateAssistantEscalation(item.id, status)
                        }
                        onError={setError}
                        onSuccess={setSuccess}
                        onForecastRefresh={() => void refreshForecast()}
                      />
                    ),
                  )}
                  {busy && (
                    <article className="roey-message assistant waiting">
                      <span>Roey</span>
                      <p>בודק את הנתונים וחושב על הצעד הבא…</p>
                    </article>
                  )}
                  <div ref={endRef} />
                </div>

                <form
                  className="roey-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void ask(message);
                  }}
                >
                  <label htmlFor="roey-message" className="sr-only">
                    הודעה ל-Roey
                  </label>
                  <textarea
                    id="roey-message"
                    name="message"
                    value={message}
                    rows={2}
                    maxLength={2_000}
                    placeholder="שאלו את Roey על המצב הפיננסי שלכם…"
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void ask(message);
                      }
                    }}
                  />
                  <button className="btn" disabled={busy || !message.trim()} type="submit">
                    שליחה
                  </button>
                </form>
              </div>

              {forecast && risk && (
                <ForecastPanel forecast={forecast} risk={risk} />
              )}
            </>
          )}
        </section>
      ) : tab === "PLAN" ? (
        <RoeyPlanPanel />
      ) : tab === "ACTIONS" ? (
        <RoeyActionsPanel
          month={month}
          conversationId={conversationId}
        />
      ) : (
        <section className="roey-settings-grid">
          <div className="card">
            <span className="roey-eyebrow">מנוע AI</span>
            <h2>Google AI Studio</h2>
            {!connection?.connected ? (
              <form className="roey-settings-form" onSubmit={connect}>
                <p className="muted">
                  צרו API Key ב־
                  <a
                    className="inline-link"
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google AI Studio
                  </a>
                  {" "}והדביקו אותו כאן פעם אחת.
                </p>
                <label className="field">
                  <span>Gemini API Key</span>
                  <input
                    name="googleAiStudioApiKey"
                    type="password"
                    value={apiKey}
                    minLength={20}
                    maxLength={500}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="הדבקת המפתח"
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
                <label className="roey-consent">
                  <input
                    name="googleAiStudioConsent"
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    אני מאשר לשלוח ל-Google הקשר פיננסי מצומצם הדרוש לתשובה.
                    מסמכים גולמיים ומפתח ה־API לא נכללים בשיחה.
                  </span>
                </label>
                <button
                  className="btn"
                  type="submit"
                  disabled={busy || apiKey.trim().length < 20 || !consent}
                >
                  {busy ? "בודק ומחבר…" : "בדיקת חיבור ושמירה"}
                </button>
              </form>
            ) : (
              <div className="roey-settings-form">
                <p className="roey-connection-ok">
                  <span aria-hidden="true">✓</span>
                  {connection.platformManaged
                    ? "מחובר במפתח מובנה של MoneyTail5"
                    : `מחובר · מפתח שמסתיים ב־${connection.keyHint}`}
                </p>
                <label className="field">
                  <span>מודל פעיל</span>
                  <select
                    name="roeyModel"
                    value={connection.modelId || ""}
                    disabled={busy || models.length === 0}
                    onChange={(event) => void selectModel(event.target.value)}
                  >
                    {models.length === 0 ? (
                      <option value={connection.modelId || ""}>
                        {connection.modelId || "טוען מודלים…"}
                      </option>
                    ) : (
                      models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <p className="field-hint">
                  {connection.platformManaged
                    ? "רשימת המודלים מגיעה מ-Google דרך המפתח המובנה של MoneyTail5."
                    : "הרשימה מתקבלת ישירות מ-Google בהתאם למפתח שלך."}
                </p>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  בדיקת חיבור מחדש
                </button>
                {!connection.platformManaged ? (
                  <button
                    className="btn quiet"
                    type="button"
                    disabled={busy}
                    onClick={() => setDisconnectOpen(true)}
                  >
                    ניתוק ומחיקת המפתח
                  </button>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    החיבור עובד אוטומטית עם מפתח MoneyTail5 — בחרו מודל והתחילו
                    לדבר בטאב השיחה.
                  </p>
                )}
              </div>
            )}
          </div>

          {profile && (
            <form className="card roey-settings-form" onSubmit={saveProfile}>
              <span className="roey-eyebrow">Roey האישי שלך</span>
              <h2>סגנון ומטרות</h2>
              <label className="field">
                <span>מה היעד המרכזי שלך עכשיו?</span>
                <input
                  name="primaryGoal"
                  value={profile.primaryGoal || ""}
                  maxLength={240}
                  placeholder="למשל: לצאת מהמינוס ולבנות כרית ביטחון"
                  onChange={(event) =>
                    setProfile({ ...profile, primaryGoal: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>סגנון תשובה</span>
                <select
                  name="tone"
                  value={profile.tone}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      tone: event.target.value as Profile["tone"],
                    })
                  }
                >
                  <option value="CONCISE">קצר וממוקד</option>
                  <option value="BALANCED">מאוזן</option>
                  <option value="EXPLANATORY">מסביר ומפורט</option>
                </select>
              </label>
              <label className="field">
                <span>רמת אסרטיביות</span>
                <select
                  name="assertiveness"
                  value={profile.assertiveness}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      assertiveness: event.target.value as Profile["assertiveness"],
                    })
                  }
                >
                  <option value="GENTLE">עדינה</option>
                  <option value="BALANCED">מאוזנת</option>
                  <option value="ASSERTIVE">אכפתית ואסרטיבית</option>
                </select>
              </label>
              <label className="field">
                <span>פניות יזומות</span>
                <select
                  name="notificationMode"
                  value={profile.notificationMode}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      notificationMode:
                        event.target.value as Profile["notificationMode"],
                    })
                  }
                >
                  <option value="OFF">כבוי</option>
                  <option value="IMPORTANT_ONLY">רק כשחשוב</option>
                  <option value="WEEKLY">סיכום שבועי</option>
                </select>
              </label>
              <label className="roey-consent">
                <input
                  name="memoryEnabled"
                  type="checkbox"
                  checked={profile.memoryEnabled}
                  onChange={(event) =>
                    setProfile({ ...profile, memoryEnabled: event.target.checked })
                  }
                />
                <span>לאפשר ל-Roey לזכור את המטרה והעדפות השיחה שלי.</span>
              </label>
              <button className="btn" type="submit" disabled={busy}>
                שמירת העדפות
              </button>
            </form>
          )}
        </section>
      )}

      {disconnectOpen && (
        <ConfirmPanel
          title="לנתק את Google AI Studio?"
          message="המפתח המוצפן יימחק מהשרת. השיחות והעדפות Roey יישארו."
          confirmLabel="ניתוק ומחיקה"
          danger
          busy={busy}
          onConfirm={() => void disconnect()}
          onCancel={() => setDisconnectOpen(false)}
        />
      )}
      {deleteSessionId && (
        <ConfirmPanel
          title="למחוק את הסשן?"
          message="השיחה תימחק לצמיתות. הפעולות שכבר בוצעו במערכת לא יבוטלו."
          confirmLabel="מחיקת הסשן"
          danger
          busy={busy}
          onConfirm={() => void deleteSession()}
          onCancel={() => setDeleteSessionId(null)}
        />
      )}
    </div>
  );
}

function AssistantMessage({
  item,
  busy,
  onActionUpdated,
  onEscalationResolved,
  onError,
  onSuccess,
  onForecastRefresh,
}: {
  item: Extract<ChatItem, { role: "ASSISTANT" }>;
  busy: boolean;
  onActionUpdated: (updated: InlineActionProposal) => void;
  onEscalationResolved: (status: "HANDOFF_REQUESTED" | "DISMISSED") => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onForecastRefresh: () => void;
}) {
  const { response } = item;
  if (!response) {
    return (
      <article className="roey-message assistant">
        <span>Roey · סשן שמור</span>
        <p>{item.content}</p>
      </article>
    );
  }
  return (
    <article className={`roey-message assistant ${response.severity.toLowerCase()}`}>
      <span>Roey · {confidenceHe(response.message.confidence)}</span>
      <p>{item.content}</p>
      {response.message.recommendationHe && (
        <div className="roey-recommendation">
          <strong>ההמלצה שלי</strong>
          <p>{response.message.recommendationHe}</p>
        </div>
      )}
      {response.message.alternativesHe.length > 0 && (
        <div className="roey-alternatives">
          <strong>אפשרויות נוספות</strong>
          <ul>
            {response.message.alternativesHe.map((alternative) => (
              <li key={alternative}>{alternative}</li>
            ))}
          </ul>
        </div>
      )}
      {response.message.questionHe && <p>{response.message.questionHe}</p>}
      {response.actionProposal && (
        <RoeyInlineAction
          proposal={{
            ...response.actionProposal,
            expiresAt:
              typeof response.actionProposal.expiresAt === "string"
                ? response.actionProposal.expiresAt
                : new Date(response.actionProposal.expiresAt).toISOString(),
          }}
          busy={busy}
          onApproved={(updated) => {
            onActionUpdated(updated);
            onSuccess("הפעולה בוצעה ונרשמה על ידי Roey.");
            onForecastRefresh();
          }}
          onRejected={(updated) => {
            onActionUpdated(updated);
            onSuccess("ההצעה נדחתה ולא בוצע שינוי.");
          }}
          onError={onError}
        />
      )}
      {response.escalation && (
        <RoeyInlineEscalation
          escalation={response.escalation}
          busy={busy}
          onResolved={(status) => {
            onEscalationResolved(status);
            onSuccess(
              status === "HANDOFF_REQUESTED"
                ? "בקשת ההעברה לאדם אושרה."
                : "בקשת ההסלמה הוסרה.",
            );
          }}
          onError={onError}
        />
      )}
      <RoeyCitations
        citations={response.agent?.citations || []}
        facts={response.factsUsed || []}
        capabilities={response.agent?.capabilities}
      />
    </article>
  );
}

function restoreChatResponse(payload: ChatResponse, conversationId: string): ChatResponse {
  const legacy = payload as ChatResponse & {
    runId?: string;
    intent?: string;
    citations?: NonNullable<ChatResponse["agent"]>["citations"];
    capabilities?: NonNullable<ChatResponse["agent"]>["capabilities"];
  };
  return {
    ...payload,
    conversationId,
    agent: payload.agent || {
      runId: legacy.runId || "",
      intent: legacy.intent || "EXPLAIN",
      citations: legacy.citations || [],
      capabilities: legacy.capabilities || [],
    },
  };
}

function ForecastPanel({ forecast, risk }: { forecast: Forecast; risk: Risk }) {
  const base = forecast.scenarios.find((scenario) => scenario.id === "BASE");
  return (
    <aside className={`card roey-forecast ${risk.severity.toLowerCase()}`}>
      <span className="roey-eyebrow">תחזית 30/60/90</span>
      <h2>{risk.titleHe}</h2>
      <p>{risk.messageHe}</p>
      <div className="roey-risk-meta">
        <span>רמת ביטחון: {confidenceHe(forecast.confidence)}</span>
        <span>זמין התחלתי: {formatIls(forecast.startingAvailable)}</span>
      </div>
      {forecast.marketContext &&
        (forecast.marketContext.policyRatePct != null ||
          forecast.marketContext.annualCpiPct != null) && (
          <div className="roey-market-factors">
            <strong>נתוני שוק רשמיים</strong>
            <div>
              {forecast.marketContext.policyRatePct != null && (
                <span>
                  ריבית בנק ישראל: {forecast.marketContext.policyRatePct}%
                </span>
              )}
              {forecast.marketContext.annualCpiPct != null && (
                <span>
                  מדד שנתי: {forecast.marketContext.annualCpiPct}%
                </span>
              )}
            </div>
            <small>
              מקור: {forecast.marketContext.sourceNames.join(", ")}
              {forecast.marketContext.observedAt
                ? ` · עדכון ${new Date(forecast.marketContext.observedAt).toLocaleDateString("he-IL")}`
                : ""}
            </small>
            <small>
              הריבית מוצגת כהקשר. תרחיש הלחץ משתמש בעלייה היפותטית של נקודת אחוז אחת.
            </small>
          </div>
        )}
      {base && (
        <div className="roey-forecast-points">
          {base.points.map((point) => (
            <div key={point.days}>
              <span>בעוד {point.days} יום</span>
              <strong className={point.projectedAvailable < 0 ? "negative" : ""}>
                {formatIls(point.projectedAvailable)}
              </strong>
            </div>
          ))}
        </div>
      )}
      <details>
        <summary>הנחות התחזית</summary>
        <ul>
          {forecast.assumptionsHe.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

function confidenceHe(value: "LOW" | "MEDIUM" | "HIGH") {
  if (value === "HIGH") return "גבוהה";
  if (value === "MEDIUM") return "בינונית";
  return "נמוכה";
}

export default function RoeyPage() {
  return (
    <Suspense fallback={<p className="muted">Roey מתכונן…</p>}>
      <RoeyPageInner />
    </Suspense>
  );
}
