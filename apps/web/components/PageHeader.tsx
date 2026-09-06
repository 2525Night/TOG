"use client";

import { type ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
};

/** Shared in-app page chrome: title + muted line, optional actions / KPI aside. */
export function PageHeader({
  title,
  subtitle,
  actions,
  aside,
}: PageHeaderProps) {
  return (
    <section className="app-page-header">
      <div className="app-page-header-main">
        <div className="app-page-header-copy">
          <h1 style={{ marginBottom: 0 }}>{title}</h1>
          {subtitle != null && subtitle !== "" && (
            <div className="app-page-header-sub muted">{subtitle}</div>
          )}
        </div>
        {actions != null && (
          <div className="app-page-header-actions">{actions}</div>
        )}
      </div>
      {aside != null && <div className="app-page-header-aside">{aside}</div>}
    </section>
  );
}
