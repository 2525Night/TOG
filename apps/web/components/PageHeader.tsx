"use client";

import { type ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  /** Small label above the title (Layered Clarity kicker). */
  kicker?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  /** Extra row under the header (e.g. DebtsSubNav). */
  footer?: ReactNode;
};

/** Shared in-app page chrome — glass page-head aligned to Layered Clarity demo. */
export function PageHeader({
  title,
  kicker,
  subtitle,
  actions,
  aside,
  footer,
}: PageHeaderProps) {
  return (
    <section className="mt-page-head rise">
      <div className="app-page-header">
        <div className="app-page-header-main">
          <div className="app-page-header-copy">
            {kicker ? <div className="mt-kicker">{kicker}</div> : null}
            <h1>{title}</h1>
            {subtitle != null && subtitle !== "" && (
              <div className="app-page-header-sub muted">{subtitle}</div>
            )}
          </div>
          {actions != null && (
            <div className="app-page-header-actions">{actions}</div>
          )}
        </div>
        {aside != null && <div className="app-page-header-aside">{aside}</div>}
      </div>
      {footer != null && <div className="mt-page-head-footer">{footer}</div>}
    </section>
  );
}
