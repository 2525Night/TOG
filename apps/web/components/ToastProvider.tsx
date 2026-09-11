"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultToastTtl,
  type NotificationKind,
  type NotificationSource,
} from "@moneytail/shared";
import { api } from "@/lib/api";

export type NotifyInput = {
  kind: NotificationKind;
  source: NotificationSource;
  titleHe: string;
  bodyHe: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  ttlSeconds?: number;
  /** Persist to service center (default true for API path). */
  persist?: boolean;
  toast?: boolean;
};

type ToastItem = {
  localId: string;
  kind: NotificationKind;
  titleHe: string;
  bodyHe: string;
  ttlMs: number;
};

type ToastContextValue = {
  notify: (input: NotifyInput) => Promise<void>;
  unreadAlerts: number;
  refreshUnread: () => Promise<void>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function kindClass(kind: NotificationKind) {
  switch (kind) {
    case "SUCCESS":
      return "mt-toast--success";
    case "ERROR":
      return "mt-toast--error";
    case "IMPORTANT":
      return "mt-toast--important";
    case "NUDGE":
      return "mt-toast--nudge";
    default:
      return "mt-toast--info";
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((localId: string) => {
    const t = timers.current.get(localId);
    if (t) clearTimeout(t);
    timers.current.delete(localId);
    setQueue((q) => q.filter((x) => x.localId !== localId));
  }, []);

  const pushToast = useCallback(
    (item: Omit<ToastItem, "localId">) => {
      const localId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setQueue((q) => [...q.slice(-2), { ...item, localId }]);
      const timer = setTimeout(() => dismiss(localId), item.ttlMs);
      timers.current.set(localId, timer);
    },
    [dismiss],
  );

  const refreshUnread = useCallback(async () => {
    try {
      const res = await api<{ count: number }>("/notifications/unread-count");
      setUnreadAlerts(res.count);
    } catch {
      /* ignore while offline / not ready */
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
    const id = setInterval(() => void refreshUnread(), 60_000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  const notify = useCallback(
    async (input: NotifyInput) => {
      const ttl = input.ttlSeconds ?? defaultToastTtl(input.kind);
      const showToast = input.toast !== false;

      if (showToast) {
        pushToast({
          kind: input.kind,
          titleHe: input.titleHe,
          bodyHe: input.bodyHe,
          ttlMs: Math.max(2, ttl) * 1000,
        });
      }

      if (input.persist === false) return;

      try {
        await api("/notifications", {
          method: "POST",
          body: JSON.stringify({
            kind: input.kind,
            source: input.source,
            titleHe: input.titleHe,
            bodyHe: input.bodyHe,
            entityType: input.entityType,
            entityId: input.entityId,
            actionUrl: input.actionUrl,
            ttlSeconds: ttl,
            toast: showToast,
          }),
        });
        if (
          input.kind === "IMPORTANT" ||
          input.kind === "NUDGE" ||
          input.kind === "ERROR"
        ) {
          void refreshUnread();
        }
      } catch {
        /* toast already shown; center persist best-effort */
      }
    },
    [pushToast, refreshUnread],
  );

  const value = useMemo(
    () => ({ notify, unreadAlerts, refreshUnread }),
    [notify, unreadAlerts, refreshUnread],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="mt-toast-host" aria-live="polite" aria-relevant="additions">
        {queue.map((t) => (
          <div
            key={t.localId}
            className={`mt-toast ${kindClass(t.kind)}`}
            role="status"
          >
            <div className="mt-toast__text">
              <strong>{t.titleHe}</strong>
              <span>{t.bodyHe}</span>
            </div>
            <button
              type="button"
              className="mt-toast__close"
              aria-label="סגירה"
              onClick={() => dismiss(t.localId)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useNotify must be used within ToastProvider");
  }
  return ctx;
}

/** Safe optional hook when provider may be missing (tests). */
export function useNotifyOptional() {
  return useContext(ToastContext);
}
