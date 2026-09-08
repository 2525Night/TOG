"use client";

import { formatIls } from "@/lib/api";

type DebtSplitMeterProps = {
  /** Left segment share 0–100 */
  leftPct: number;
  leftLabel: string;
  leftAmount: number;
  rightLabel: string;
  rightAmount: number;
  /** Visual tone */
  variant?: "loan" | "credit";
  title?: string;
  /** Shown next to title (e.g. total credit limit) */
  titleAmount?: number;
  emphasis?: string;
};

/** Dual-segment meter: answers “what’s done vs what’s left” without a thin gray bar. */
export function DebtSplitMeter({
  leftPct,
  leftLabel,
  leftAmount,
  rightLabel,
  rightAmount,
  variant = "loan",
  title,
  titleAmount,
  emphasis,
}: DebtSplitMeterProps) {
  const pct = Math.max(0, Math.min(100, leftPct));
  return (
    <div className={`debt-split debt-split--${variant}`}>
      {(title || emphasis || titleAmount != null) && (
        <div className="debt-split-head">
          {title || titleAmount != null ? (
            <span className="debt-split-title muted">
              {title}
              {titleAmount != null && (
                <strong className="debt-split-title-amt">
                  {formatIls(titleAmount)}
                </strong>
              )}
            </span>
          ) : (
            <span />
          )}
          {emphasis != null && <strong>{emphasis}</strong>}
        </div>
      )}
      <div
        className="debt-split-track"
        role="img"
        aria-label={`${leftLabel} ${formatIls(leftAmount)}, ${rightLabel} ${formatIls(rightAmount)}`}
      >
        <div className="debt-split-left" style={{ width: `${pct}%` }} />
        <div className="debt-split-right" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="debt-split-legend">
        <div>
          <span className="debt-split-dot debt-split-dot--left" aria-hidden />
          <span className="muted">{leftLabel}</span>
          <strong>{formatIls(leftAmount)}</strong>
        </div>
        <div>
          <span className="debt-split-dot debt-split-dot--right" aria-hidden />
          <span className="muted">{rightLabel}</span>
          <strong>{formatIls(rightAmount)}</strong>
        </div>
      </div>
    </div>
  );
}
