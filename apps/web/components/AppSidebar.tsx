"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setToken } from "@/lib/api";
import { appHref, useSelectedMonth } from "@/components/PeriodBar";

const links = [
  { href: "/app", label: "תמונת מצב" },
  { href: "/app/money", label: "תנועות" },
  { href: "/app/reports", label: "מאזן" },
  { href: "/app/goals", label: "יעדים" },
];

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
  hideNav?: boolean;
};

export function AppSidebar({ open, onClose, hideNav }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const month = useSelectedMonth();

  return (
    <>
      <div
        className={`sidebar-backdrop${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          Money<span>Tail</span>
        </div>
        {!hideNav && (
          <nav className="sidebar-nav">
            {links.map((l) => (
              <Link
                key={l.href}
                href={appHref(l.href, month)}
                className={
                  l.href === "/app"
                    ? pathname === "/app"
                      ? "active"
                      : undefined
                    : pathname.startsWith(l.href)
                      ? "active"
                      : undefined
                }
                onClick={onClose}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
        {hideNav && <div style={{ flex: 1 }} />}
        <div className="sidebar-footer">
          <button
            className="btn"
            type="button"
            onClick={() => {
              setToken(null);
              router.push("/login");
            }}
          >
            יציאה
          </button>
        </div>
      </aside>
    </>
  );
}
