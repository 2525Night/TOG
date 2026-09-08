"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appHref, useSelectedMonth } from "@/components/PeriodBar";

const items = [
  { href: "/app/debts", label: "סקירה", match: "exact" as const },
  { href: "/app/debts/loans", label: "הלוואות", match: "prefix" as const },
  { href: "/app/debts/cards", label: "כרטיסי אשראי", match: "prefix" as const },
];

function isActive(pathname: string, item: (typeof items)[number]) {
  if (item.match === "exact") {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Native Next Link only — no click interception (that stalled soft-nav). */
export function DebtsSubNav() {
  const pathname = usePathname();
  const month = useSelectedMonth();

  return (
    <nav className="debts-subnav" aria-label="אשראי והלוואות">
      {items.map((item) => {
        const href = appHref(item.href, month);
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={href}
            prefetch
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
