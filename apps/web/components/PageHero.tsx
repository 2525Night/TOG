"use client";

import type { ReactNode } from "react";

type PageHeroProps = {
  kicker?: string;
  amount: ReactNode;
  unit?: ReactNode;
  answer?: ReactNode;
  support?: ReactNode;
  size?: "sm" | "lg";
  /** Negative amount styling (soft danger tint on gradient). */
  negative?: boolean;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};

/**
 * Glass+Void page hero — serif gradient metric + mint→amber hairline.
 * Used for primary answers (home, money checking, cash, reports, debts…).
 */
export function PageHero({
  kicker,
  amount,
  unit,
  answer,
  support,
  size,
  negative,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: PageHeroProps) {
  const sizeCls = size ? ` pg-hero--${size}` : "";
  const negCls = negative ? " pg-hero--neg" : "";
  const extra = className ? ` ${className}` : "";
  return (
    <section
      className={`pg-hero${sizeCls}${negCls}${extra}`}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="pg-hero__stage" aria-hidden="true" />
      {kicker ? <p className="pg-hero__kicker">{kicker}</p> : null}
      <div className="pg-hero__amt">
        {amount}
        {unit != null && unit !== "" ? (
          <span className="pg-hero__unit">{unit}</span>
        ) : null}
      </div>
      <div className="pg-hero__line" aria-hidden="true" />
      {answer != null && answer !== "" ? (
        <p className="pg-hero__ans">{answer}</p>
      ) : null}
      {support != null && support !== "" ? (
        <div className="pg-hero__support">{support}</div>
      ) : null}
    </section>
  );
}
