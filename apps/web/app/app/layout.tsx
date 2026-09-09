"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandLockup } from "@/components/BrandLockup";
import { api, getToken, setToken, invalidateApiCache } from "@/lib/api";

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
  const [gateError, setGateError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnboarding = pathname.startsWith("/app/onboarding");
  const authedRef = useRef(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function loadMe() {
    invalidateApiCache("/auth/me");
    const user = await api<Me>("/auth/me");
    authedRef.current = true;
    setMe(user);
    setGateError(null);
    setReady(true);
    return user;
  }

  // Auth gate — only send to login on missing/invalid token (401), not on network blips.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    loadMe().catch((err) => {
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : "";
      const unauthorized =
        /שגוי|Unauthorized|401|jwt|token|לא מאומת|אימייל או סיסמה/i.test(msg);
      if (unauthorized) {
        setToken(null);
        router.replace("/login");
        return;
      }
      if (!authedRef.current) {
        setGateError("אין קשר לשרת כרגע — נסו שוב");
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Keep onboarding flag fresh after /app/onboarding → /app (same layout instance).
  useEffect(() => {
    if (!ready || !getToken()) return;
    let cancelled = false;
    loadMe()
      .then((user) => {
        if (cancelled || !user) return;
        if (!user.onboardingCompleted && !isOnboarding) {
          router.replace("/app/onboarding");
        } else if (user.onboardingCompleted && isOnboarding) {
          router.replace("/app");
        }
      })
      .catch(() => {
        /* keep current screen; auth effect handles hard failures */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, ready, isOnboarding, router]);

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

  if (gateError && !me) {
    return (
      <div className="container" style={{ padding: "2rem 1rem" }}>
        <p className="form-error" role="alert">
          {gateError}
        </p>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setReady(false);
            setGateError(null);
            loadMe().catch(() => router.replace("/login"));
          }}
        >
          נסו שוב
        </button>
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
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            תפריט
          </button>
        </div>
        <div
          className="container screen-enter"
          id="main-content"
          key={pathname}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
