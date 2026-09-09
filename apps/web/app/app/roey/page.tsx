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
};

type ChatItem =
  | { id: string; role: "USER"; content: string }
  | { id: string; role: "ASSISTANT"; content: string; response: ChatResponse };

const QUICK_PROMPTS = [
  "מה מצב החודש שלי?",
  "מה מסכן אותי כרגע?",
  "מה הצעד הבא שכדאי לי לעשות?",
  "תציג לי תחזית ל-90 יום",
];

function RoeyPageInner() {
  const month = useSelectedMonth();
  const [tab, setTab] = useState<"CHAT" | "SETTINGS">("CHAT");
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
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConnection, nextProfile] = await Promise.all([
        api<Connection>("/roey/connections/google-ai-studio"),
        api<Profile>("/roey/profile"),
      ]);
      setConnection(nextConnection);
      setProfile(nextProfile);
      if (nextConnection.connected) {
        const [modelResult, forecastResult] = await Promise.all([
          api<{ models: ModelOption[]; selectedModelId: string | null }>(
            "/roey/connections/models",
          ),
          api<{ forecast: Forecast; risk: Risk }>(
            `/roey/forecast?month=${encodeURIComponent(month)}`,
          ),
        ]);
        setModels(modelResult.models);
        setForecast(forecastResult.forecast);
        setRisk(forecastResult.risk);
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
      setConnection({ connected: false });
      setModels([]);
      setForecast(null);
      setRisk(null);
      setMessages([]);
      setConversationId(null);
      setSuccess("החיבור נותק והמפתח נמחק");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Roey לא הצליח לענות");
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
          aria-selected={tab === "SETTINGS"}
          className={tab === "SETTINGS" ? "active" : ""}
          onClick={() => setTab("SETTINGS")}
        >
          הגדרות וחיבור
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
              <div className="roey-chat card">
                {messages.length === 0 && (
                  <div className="roey-welcome">
                    <div className="roey-avatar large" aria-hidden="true">R</div>
                    <h2>במה נתחיל?</h2>
                    <p className="muted">
                      אני משתמש רק בנתונים המחושבים של MoneyTail ומציין כשהתמונה חלקית.
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
                      <AssistantMessage key={item.id} item={item} />
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
                  מחובר · מפתח שמסתיים ב־{connection.keyHint}
                </p>
                <label className="field">
                  <span>מודל פעיל</span>
                  <select
                    name="roeyModel"
                    value={connection.modelId || ""}
                    disabled={busy}
                    onChange={(event) => void selectModel(event.target.value)}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field-hint">
                  הרשימה מתקבלת ישירות מ-Google בהתאם למפתח שלך.
                </p>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  בדיקת חיבור מחדש
                </button>
                <button
                  className="btn quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => setDisconnectOpen(true)}
                >
                  ניתוק ומחיקת המפתח
                </button>
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
    </div>
  );
}

function AssistantMessage({
  item,
}: {
  item: Extract<ChatItem, { role: "ASSISTANT" }>;
}) {
  const { response } = item;
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
      <details className="roey-sources">
        <summary>על אילו נתונים הסתמכתי?</summary>
        <ul>
          {response.factsUsed.map((fact) => (
            <li key={fact.id}>
              <span>{fact.labelHe}</span>
              <strong>{fact.displayHe}</strong>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
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
