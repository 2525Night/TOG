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
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="תפריט ראשי">
        <div className="brand">
          <BrandLockup />
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
                <span className="nav-ico" aria-hidden="true">
                  {l.ico}
                </span>
                <span>{l.label}</span>
              </Link>
            ))}
          </nav>
        )}
        {hideNav && <div style={{ flex: 1 }} />}
        <div className="sidebar-footer">
          <div className="meta">Layered Clarity · בהירות + רגש</div>
          <button
            className="btn quiet"
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
