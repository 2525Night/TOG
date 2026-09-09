"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Native Android feel: hardware back, status bar, app CSS class.
 * Safe no-op in the browser.
 */
export function MobileNativeShell() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let removeBack: (() => void) | undefined;

    async function boot() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        document.documentElement.classList.add("is-native-app");

        try {
          const { StatusBar, Style } = await import("@capacitor/status-bar");
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#15202b" });
        } catch {
          /* plugin optional until sync */
        }

        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          const backdrop = document.querySelector<HTMLElement>(
            ".sidebar-backdrop.open",
          );
          if (backdrop) {
            backdrop.click();
            return;
          }

          const overlay = document.querySelector<HTMLElement>(
            "[data-dismiss-overlay], .confirm-backdrop.open, .modal-backdrop",
          );
          if (overlay) {
            overlay.click();
            return;
          }

          // Prefer in-app history (Next.js routes) over exiting the process.
          if (canGoBack || window.history.length > 1) {
            window.history.back();
            return;
          }

          void App.minimizeApp();
        });

        if (cancelled) {
          void handle.remove();
          return;
        }
        removeBack = () => {
          void handle.remove();
        };
      } catch {
        /* browser / missing plugins */
      }
    }

    void boot();
    return () => {
      cancelled = true;
      removeBack?.();
      document.documentElement.classList.remove("is-native-app");
    };
  }, []);

  // Scroll to top only on real page changes — never on query/filter clicks.
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev == null || prev === pathname) return;
    if (typeof window === "undefined") return;

    const main = document.querySelector(".app-main");
    if (main instanceof HTMLElement) {
      main.scrollTo({ top: 0, behavior: "auto" });
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
