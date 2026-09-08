"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandLockup } from "@/components/BrandLockup";
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
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnboarding = pathname.startsWith("/app/onboarding");
  const authedRef = useRef(false);

  // Auth once — do not re-gate on every route change (breaks nav when API is slow/down).
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    api<Me>("/auth/me")
      .then((user) => {
        if (cancelled) return;
        authedRef.current = true;
        setMe(user);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        if (!authedRef.current) {
          router.replace("/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!ready || !me) return;
    if (!me.onboardingCompleted && !isOnboarding) {
      router.replace("/app/onboarding");
      return;
    }
    if (me.onboardingCompleted && isOnboarding) {
      router.replace("/app");
    }
  }, [ready, me, isOnboarding, router]);

  if (!ready) {
    return (
      <div className="skeleton-shell" aria-busy="true" aria-label="טוען">
        <div className="skeleton-block">
          <div className="skeleton-line lg" />
          <div className="skeleton-line md" />
          <div className="skeleton-line sm" />
          <div className="skeleton-line md" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <span className="app-orb a" aria-hidden="true" />
      <span className="app-orb b" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
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
            <BrandLockup size="sm" />
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
        <div className="container" id="main-content">
          {children}
        </div>
      </div>
    </div>
  );
}
