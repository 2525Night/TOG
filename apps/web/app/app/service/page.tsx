"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  NotificationEventDto,
  NotificationPrefsDto,
} from "@moneytail/shared";
import { DEFAULT_NOTIFICATION_PREFS } from "@moneytail/shared";
import { api } from "@/lib/api";
import { PageDock, PageDockShell } from "@/components/PageDock";
import { useNotify } from "@/components/ToastProvider";

type TabId = "alerts" | "updates" | "settings";

function kindLabel(kind: string) {
  switch (kind) {
    case "SUCCESS":
      return "הצלחה";
    case "ERROR":
      return "שגיאה";
    case "IMPORTANT":
      return "חשוב";
    case "NUDGE":
      return "תזכורת";
    default:
      return "מידע";
  }
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ServiceCenterPage() {
  const { refreshUnread, notify, unreadAlerts } = useNotify();
  const [tab, setTab] = useState<TabId>("alerts");
  const [items, setItems] = useState<NotificationEventDto[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefsDto>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async (centerTab: "ALERTS" | "UPDATES") => {
    const res = await api<{ items: NotificationEventDto[] }>(
      `/notifications?tab=${centerTab}`,
    );
    setItems(res.items);
  }, []);

  const loadPrefs = useCallback(async () => {
    const next = await api<NotificationPrefsDto>("/notifications/prefs");
    setPrefs(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "settings") {
        await loadPrefs();
      } else {
        await loadList(tab === "alerts" ? "ALERTS" : "UPDATES");
      }
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, [tab, loadList, loadPrefs, refreshUnread]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function markAllRead() {
    setBusy(true);
    try {
      await api("/notifications/mark-all-read?tab=ALERTS", { method: "POST" });
      await reload();
      await notify({
        kind: "INFO",
        source: "SYSTEM",
        titleHe: "מרכז שירות",
        bodyHe: "כל ההתראות סומנו כנקראו",
        persist: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, readAt: x.readAt ?? new Date().toISOString() } : x,
        ),
      );
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
  }

  async function removeOne(id: string) {
    try {
      await api(`/notifications/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
  }

  async function clearOld() {
    setBusy(true);
    try {
      const res = await api<{ cleared: number }>("/notifications/clear-old?days=30", {
        method: "POST",
      });
      await reload();
      await notify({
        kind: "SUCCESS",
        source: "SYSTEM",
        titleHe: "נוקה",
        bodyHe: `הוסרו ${res.cleared} פריטים ישנים`,
        persist: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function patchPrefs(patch: Partial<NotificationPrefsDto>) {
    setBusy(true);
    try {
      const next = await api<NotificationPrefsDto>("/notifications/prefs", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setPrefs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageDockShell className="service-center">
      <header className="service-head">
        <p className="service-kicker">מרכז שירות</p>
        <h1>התראות ועדכונים</h1>
        <p className="muted service-lead">
          מה דורש תשומת לב, מה כבר נעשה, ואיך שולטים בערוצים.
        </p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "alerts" ? (
        <section className="service-panel" aria-label="התראות">
          <div className="service-toolbar">
            <button
              type="button"
              className="btn quiet"
              disabled={busy || loading}
              onClick={() => void markAllRead()}
            >
              סמן הכל נקרא
            </button>
          </div>
          {loading ? (
            <p className="muted">טוען…</p>
          ) : items.length === 0 ? (
            <p className="muted service-empty">אין התראות כרגע — הכל רגוע.</p>
          ) : (
            <ul className="service-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`service-item${item.readAt ? " is-read" : " is-new"}`}
                >
                  <div className="service-item__meta">
                    <span className={`service-kind kind-${item.kind.toLowerCase()}`}>
                      {kindLabel(item.kind)}
                    </span>
                    <span className="service-when">{formatWhen(item.createdAt)}</span>
                    {!item.readAt ? (
                      <span className="service-badge-new">חדש</span>
                    ) : (
                      <span className="service-badge-read">נקרא</span>
                    )}
                  </div>
                  <strong className="service-item__title">{item.titleHe}</strong>
                  <p className="service-item__body">{item.bodyHe}</p>
                  <div className="service-item__actions">
                    {!item.readAt ? (
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() => void markOne(item.id)}
                      >
                        סמן נקרא
                      </button>
                    ) : null}
                    {item.actionUrl ? (
                      <a className="btn quiet" href={item.actionUrl}>
                        פתיחה
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn quiet"
                      onClick={() => void removeOne(item.id)}
                    >
                      מחיקה
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "updates" ? (
        <section className="service-panel" aria-label="עדכונים">
          {loading ? (
            <p className="muted">טוען…</p>
          ) : items.length === 0 ? (
            <p className="muted service-empty">עדיין אין עדכונים ביומן.</p>
          ) : (
            <ul className="service-list">
              {items.map((item) => (
                <li key={item.id} className="service-item is-update">
                  <div className="service-item__meta">
                    <span className={`service-kind kind-${item.kind.toLowerCase()}`}>
                      {kindLabel(item.kind)}
                    </span>
                    <span className="service-when">{formatWhen(item.createdAt)}</span>
                  </div>
                  <strong className="service-item__title">{item.titleHe}</strong>
                  <p className="service-item__body">{item.bodyHe}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="service-panel service-settings" aria-label="הגדרות התראות">
          {loading ? (
            <p className="muted">טוען…</p>
          ) : (
            <>
              <fieldset className="service-fieldset">
                <legend>באפליקציה</legend>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.toastEnabled}
                    disabled={busy}
                    onChange={(e) =>
                      void patchPrefs({ toastEnabled: e.target.checked })
                    }
                  />
                  <span>Toast מיידי במסך</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.saveSuccessToUpdates}
                    disabled={busy}
                    onChange={(e) =>
                      void patchPrefs({ saveSuccessToUpdates: e.target.checked })
                    }
                  />
                  <span>שמירת הצלחות בלשונית עדכונים</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.roeyNudgesInCenter}
                    disabled={busy}
                    onChange={(e) =>
                      void patchPrefs({ roeyNudgesInCenter: e.target.checked })
                    }
                  />
                  <span>תזכורות Roey במרכז ההתראות</span>
                </label>
              </fieldset>

              <fieldset className="service-fieldset">
                <legend>התראת מערכת באנדרואיד</legend>
                <p className="muted service-os-note">
                  כשהאפליקציה ברקע — אפשר לקבל התראות במגש המערכת. השליטה כאן;
                  המימוש המלא (Local Notifications) יחובר בהמשך.
                </p>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.osNotificationsEnabled}
                    disabled={busy}
                    onChange={(e) =>
                      void patchPrefs({
                        osNotificationsEnabled: e.target.checked,
                      })
                    }
                  />
                  <span>הפעלת התראות מערכת</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.osImportant}
                    disabled={busy || !prefs.osNotificationsEnabled}
                    onChange={(e) =>
                      void patchPrefs({ osImportant: e.target.checked })
                    }
                  />
                  <span>חשוב / סיכון</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.osNudge}
                    disabled={busy || !prefs.osNotificationsEnabled}
                    onChange={(e) =>
                      void patchPrefs({ osNudge: e.target.checked })
                    }
                  />
                  <span>תזכורות Roey</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.osWeeklyDigest}
                    disabled={busy || !prefs.osNotificationsEnabled}
                    onChange={(e) =>
                      void patchPrefs({ osWeeklyDigest: e.target.checked })
                    }
                  />
                  <span>סיכום שבועי</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.osActionErrors}
                    disabled={busy || !prefs.osNotificationsEnabled}
                    onChange={(e) =>
                      void patchPrefs({ osActionErrors: e.target.checked })
                    }
                  />
                  <span>שגיאות שדורשות טיפול</span>
                </label>
                <label className="service-switch">
                  <input
                    type="checkbox"
                    checked={prefs.osSuccess}
                    disabled={busy || !prefs.osNotificationsEnabled}
                    onChange={(e) =>
                      void patchPrefs({ osSuccess: e.target.checked })
                    }
                  />
                  <span>הצלחות שגרתיות (לא מומלץ)</span>
                </label>
              </fieldset>

              <div className="service-toolbar">
                <button
                  type="button"
                  className="btn quiet"
                  disabled={busy}
                  onClick={() => void clearOld()}
                >
                  נקה ישנים (מעל 30 יום, רק נקראים)
                </button>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                מצב Roey נוכחי:{" "}
                {prefs.notificationMode === "OFF"
                  ? "כבוי"
                  : prefs.notificationMode === "WEEKLY"
                    ? "שבועי"
                    : "רק חשוב"}
              </p>
            </>
          )}
        </section>
      ) : null}

      <PageDock
        ariaLabel="ניווט מרכז שירות"
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        items={[
          {
            id: "alerts",
            label: "התראות",
            badge: unreadAlerts > 0 ? unreadAlerts : undefined,
          },
          { id: "updates", label: "עדכונים" },
          { id: "settings", label: "הגדרות" },
        ]}
      />
    </PageDockShell>
  );
}
