"use client";

import type { ReactNode } from "react";

export type PageDockItem = {
  id: string;
  label: string;
  badge?: number;
};

type PageDockProps = {
  items: PageDockItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
};

/**
 * Contextual bottom dock (same pattern as Roey).
 * Page-local modes only — not global navigation.
 */
export function PageDock({ items, value, onChange, ariaLabel }: PageDockProps) {
  return (
    <nav className="page-dock" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : undefined}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {typeof item.badge === "number" && item.badge > 0 ? (
              <span className="page-dock-badge" aria-label={`${item.badge} ממתינים`}>
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

type PageDockLinksProps = {
  items: Array<{
    id: string;
    label: string;
    href: string;
    active: boolean;
  }>;
  ariaLabel: string;
};

/** Link-based dock (e.g. debts routes). */
export function PageDockLinks({ items, ariaLabel }: PageDockLinksProps) {
  return (
    <nav className="page-dock" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          aria-current={item.active ? "page" : undefined}
          className={item.active ? "active" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function PageDockShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`has-page-dock${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
