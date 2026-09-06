"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { api, getToken } from "@/lib/api";

type Me = {
  id: string;
  email: string;
  onboardingCompleted: boolean;
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnboarding = pathname.startsWith("/app/onboarding");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    api<Me>("/auth/me")
      .then((me) => {
        if (!me.onboardingCompleted && !isOnboarding) {
          router.replace("/app/onboarding");
          return;
        }
        if (me.onboardingCompleted && isOnboarding) {
          router.replace("/app");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router, pathname, isOnboarding]);

  if (!ready) {
    return (
      <div className="auth-shell">
        <p className="muted">טוען את MoneyTail…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Suspense fallback={null}>
        <AppSidebar
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          hideNav={isOnboarding}
        />
      </Suspense>
      <div className="app-main">
        <div className="mobile-topbar">
          <div className="brand">
            Money<span>Tail</span>
          </div>
          <button
            className="icon-btn"
            type="button"
            aria-label="תפריט"
            onClick={() => setMenuOpen(true)}
          >
            תפריט
          </button>
        </div>
        <div className="container">{children}</div>
      </div>
    </div>
  );
}
