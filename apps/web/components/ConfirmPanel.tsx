"use client";

import { ReactNode, useEffect, useId, useRef } from "react";

type ConfirmPanelProps = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-app destructive/action confirm — replaces window.confirm. */
export function ConfirmPanel({
  title,
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmPanelProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <section
      className={`card confirm-panel${danger ? " danger" : ""}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="confirm-panel"
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        {title}
      </h2>
      <p className="mt-confirm-reassure muted" style={{ marginTop: 0, marginBottom: "0.35rem", fontSize: "0.9rem" }}>
        אפשר לבטל — שום דבר לא משתנה לפני שתאשרו.
      </p>
      <div id={descId} className="muted" style={{ marginBottom: "0.75rem" }}>
        {typeof message === "string" ? <p style={{ margin: 0 }}>{message}</p> : message}
      </div>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className={danger ? "btn danger" : "btn"}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          ref={cancelRef}
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      </div>
    </section>
  );
}
