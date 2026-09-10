"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setToken } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";
import { appHref, useSelectedMonth } from "@/components/PeriodBar";

const links = [
  { href: "/app", label: "תמונת מצב", ico: "◎" },
  { href: "/app/money", label: "תנועות", ico: "⇄" },
  { href: "/app/reports", label: "מאזן", ico: "▣" },
  { href: "/app/debts", label: "אשראי והלוואות", ico: "◇" },
  { href: "/app/goals", label: "יעדים", ico: "○" },
  { href: "/app/roey", label: "Roey", ico: "✦" },
  { href: "/app/settings", label: "הגדרות", ico: "⚙" },
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
      <aside
        id="app-sidebar"
        className={`sidebar${open ? " open" : ""}`}
        aria-label="תפריט ראשי"
      >
        <div className="sidebar-head">
          <div className="brand">
            <BrandLockup size="sm" />
          </div>
          <button
            type="button"
            className="sidebar-close"
            aria-label="סגירת תפריט"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="sidebar-kicker">מסע הכסף · ניווט ראשי</p>
        {!hideNav && (
          <nav className="sidebar-nav">
            {links.map((l) => {
              const active =
                l.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={appHref(l.href, month)}
                  className={active ? "active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                >
                  <span className="nav-ico" aria-hidden="true">
                    {l.ico}
                  </span>
                  <span className="nav-label">{l.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
        {hideNav && <div style={{ flex: 1 }} />}
        <div className="sidebar-footer">
          <div className="meta">MoneyTail5</div>
          <button
            className="btn quiet sidebar-logout"
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
