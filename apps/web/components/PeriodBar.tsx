"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatIls } from "@/lib/api";

const MONTH_STORAGE_KEY = "moneytail.selectedMonth";

function labelMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
}

export function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function readStoredMonth(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(MONTH_STORAGE_KEY);
    return v && /^\d{4}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredMonth(ym: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MONTH_STORAGE_KEY, ym);
  } catch {
    /* ignore */
  }
}

/** Resolve month: URL → localStorage → calendar current. */
export function resolveAppMonth(urlMonth: string | null): string {
  if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth)) return urlMonth;
  return readStoredMonth() || currentMonthKey();
}

function usePersistMonthToUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const urlMonth = search.get("month");
    if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth)) {
      writeStoredMonth(urlMonth);
      return;
    }
    const stored = readStoredMonth();
    if (!stored) return;
    const params = new URLSearchParams(search.toString());
    params.set("month", stored);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, search]);
}

function setMonthOnRoute(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  search: URLSearchParams,
  next: string,
) {
  writeStoredMonth(next);
  const params = new URLSearchParams(search.toString());
  params.set("month", next);
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
}

export function monthOptionsAround(past = 12, future = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = past; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  out.push(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  for (let i = 1; i <= future; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

/** Shift YYYY-MM by delta months. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type MonthPickerProps = {
  quiet?: boolean;
  className?: string;
};

/** Shared month select (past + up to 12 future) + optional custom picker. */
function MonthPicker({ quiet, className }: MonthPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  usePersistMonthToUrl();
  const options = useMemo(() => monthOptionsAround(12, 12), []);
  const month = resolveAppMonth(search.get("month"));
  const inList = options.includes(month);
  const nowKey = currentMonthKey();
  const [customOpen, setCustomOpen] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  function setMonth(next: string) {
    if (!/^\d{4}-\d{2}$/.test(next)) return;
    setMonthOnRoute(router, pathname, search, next);
  }

  useEffect(() => {
    if (!customOpen) return;
    const el = customInputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      /* unsupported */
    }
  }, [customOpen]);

  return (
    <div
      className={`month-picker-row${quiet ? " quiet" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="month-nav" role="group" aria-label="ניווט בין חודשים">
        <button
          type="button"
          className="month-nav-btn"
          aria-label="חודש קודם"
          title="חודש קודם"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <span aria-hidden>‹</span>
        </button>
        <label className={quiet ? "month-select-quiet" : "period-bar-month"}>
          {quiet ? (
            <span className="sr-only">בחירת חודש</span>
          ) : (
            <span className="muted">חודש</span>
          )}
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {!inList && (
              <option value={month}>{labelMonth(month)}</option>
            )}
            {options.map((ym) => (
              <option key={ym} value={ym}>
                {labelMonth(ym)}
                {ym > nowKey ? " (עתידי)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="month-nav-btn"
          aria-label="חודש הבא"
          title="חודש הבא"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <span aria-hidden>›</span>
        </button>
      </div>
      <div className="month-custom-pick">
        {!customOpen ? (
          <button
            type="button"
            className="month-custom-btn"
            onClick={() => setCustomOpen(true)}
            aria-expanded={false}
            title="בחירת חודש מותאמת"
          >
            מותאם
          </button>
        ) : (
          <div className="month-custom-open">
            <input
              ref={customInputRef}
              type="month"
              value={month}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                setMonth(next);
                setCustomOpen(false);
              }}
              aria-label="בחירת חודש מותאמת"
              title="בחירת חודש מותאמת"
            />
            <button
              type="button"
              className="linkish month-custom-cancel"
              onClick={() => setCustomOpen(false)}
            >
              סגור
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type PeriodBarProps = {
  /** Checking / עו״ש balance — labeled «יתרה בעו״ש» by default. */
  balance?: number | null;
  balanceLabel?: string;
  income?: number | null;
  expense?: number | null;
  extra?: ReactNode;
};

export function PeriodBar({
  balance,
  balanceLabel = "יתרה בעו״ש",
  income,
  expense,
  extra,
}: PeriodBarProps) {
  return (
    <div className="period-bar">
      <MonthPicker />
      <div className="period-bar-stats">
        {balance != null && (
          <span>
            {balanceLabel} <strong>{formatIls(balance)}</strong>
          </span>
        )}
        {income != null && (
          <span className="tx-in">
            הכנסות <strong>{formatIls(income)}</strong>
          </span>
        )}
        {expense != null && (
          <span className="tx-out">
            הוצאות <strong>{formatIls(expense)}</strong>
          </span>
        )}
        {extra}
      </div>
    </div>
  );
}

export function useSelectedMonth() {
  const search = useSearchParams();
  usePersistMonthToUrl();
  return resolveAppMonth(search.get("month"));
}

/** Local calendar month key (avoids UTC slice drift for IL). */
export function monthKeyLocal(input: Date | string) {
  const d = typeof input === "string" ? new Date(input) : input;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyFromIso(iso: string) {
  return monthKeyLocal(iso);
}

export function labelMonthHe(ym: string) {
  return labelMonth(ym);
}

/** Subtle month switcher (same picker; quieter chrome). */
export function MonthSelect({ className }: { className?: string }) {
  return <MonthPicker quiet className={className} />;
}

/** Build app href preserving the selected month. */
export function appHref(path: string, month?: string | null) {
  const ym = month || readStoredMonth() || currentMonthKey();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}month=${ym}`;
}
