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

  useEffect(() => {
    const viewport = window.visualViewport;
    const sync = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const editing =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches("input, textarea, [contenteditable='true']");
      const inset =
        editing && viewport
          ? Math.max(0, window.innerHeight - viewport.height - offsetTop)
          : 0;
      const root = document.documentElement;
      root.style.setProperty("--app-vvh", `${height}px`);
      root.style.setProperty("--vv-offset-top", `${offsetTop}px`);
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.classList.toggle("keyboard-open", inset > 80);
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
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
