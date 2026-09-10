"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RoeyLauncher() {
  const pathname = usePathname();
  if (
    pathname.startsWith("/app/onboarding") ||
    pathname.startsWith("/app/roey")
  ) {
    return null;
  }

  return (
    <Link
      href="/app/roey"
      className="roey-launcher"
      aria-label="פתיחת Roey, המלווה הפיננסי"
    >
      <span className="roey-launcher__mark" aria-hidden="true">
        R
      </span>
      <span className="roey-launcher__copy">
        <strong>Roey</strong>
        <small>המלווה שלך</small>
      </span>
    </Link>
  );
}
