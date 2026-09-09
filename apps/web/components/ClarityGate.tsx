"use client";

import { useEffect } from "react";
import { BrandLockup } from "@/components/BrandLockup";

type ClarityGateProps = {
  /** Called when the gate finishes (navigate from here). */
  onDone: () => void;
  message?: string;
};

/**
 * Clarity Gate — short brand moment after auth (~1.1s).
 * Ring breathe + soft mood reveal + mint pulse. Reduced-motion = quick fade.
 */
export function ClarityGate({
  onDone,
  message = "רק רגע…",
}: ClarityGateProps) {
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 320 : 1100;
    const id = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div
      className="clarity-gate"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="clarity-gate-mood" aria-hidden="true" />
      <div className="clarity-gate-center">
        <div className="clarity-gate-lockup">
          <BrandLockup size="lg" />
        </div>
        <span className="clarity-gate-pulse" aria-hidden="true" />
        <p className="clarity-gate-msg">{message}</p>
      </div>
    </div>
  );
}
