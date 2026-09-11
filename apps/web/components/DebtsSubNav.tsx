"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appHref, useSelectedMonth } from "@/components/PeriodBar";

const items = [
  { href: "/app/debts", label: "סקירה", match: "exact" as const, id: "overview" },
  {
    href: "/app/debts/loans",
    label: "הלוואות",
    match: "prefix" as const,
    id: "loans",
  },
  {
    href: "/app/debts/cards",
    label: "כרטיסי אשראי",
    match: "prefix" as const,
    id: "cards",
  },
];

function isActive(pathname: string, item: (typeof items)[number]) {
  if (item.match === "exact") {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Bottom contextual dock for אשראי והלוואות (replaces header DebtsSubNav). */
export function DebtsSubNav() {
  const pathname = usePathname();
  const month = useSelectedMonth();

  return (
    <nav className="page-dock" role="tablist" aria-label="אשראי והלוואות">
      {items.map((item) => {
        const href = appHref(item.href, month);
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={href}
            prefetch
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={active ? "active" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
