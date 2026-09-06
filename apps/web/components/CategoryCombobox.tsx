"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { natureLabelHe, type CategoryNature } from "@moneytail/shared";

export type ComboboxCategory = {
  key: string;
  labelHe: string;
  nature?: CategoryNature;
};

type Props = {
  options: ComboboxCategory[];
  value: string;
  onChange: (key: string) => void;
  onCreate?: (labelHe: string, asFixed: boolean) => Promise<void> | void;
  disabled?: boolean;
  showNatureHint?: boolean;
  placeholder?: string;
};

export function CategoryCombobox({
  options,
  value,
  onChange,
  onCreate,
  disabled,
  showNatureHint = false,
  placeholder = "חיפוש קטגוריה…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asFixed, setAsFixed] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.key === value);
  const display = open ? query : selected?.labelHe || "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.labelHe.toLowerCase().includes(q));
  }, [options, query]);

  const exactMatch = options.some(
    (o) => o.labelHe.trim().toLowerCase() === query.trim().toLowerCase(),
  );
  const canCreate =
    Boolean(onCreate) && query.trim().length > 0 && !exactMatch;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function handleCreate() {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    try {
      await onCreate(query.trim(), asFixed);
      setQuery("");
      setAsFixed(false);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="cat-combo" ref={rootRef}>
      <input
        className="cat-combo-input"
        value={display}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery(selected?.labelHe || "");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />
      {showNatureHint && selected?.nature && (
        <span className="cat-combo-nature muted">
          {natureLabelHe(selected.nature)}
        </span>
      )}
      {open && (
        <div className="cat-combo-menu" role="listbox">
          {filtered.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`cat-combo-option${o.key === value ? " active" : ""}`}
              role="option"
              aria-selected={o.key === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.key);
                setQuery("");
                setOpen(false);
              }}
            >
              <span>{o.labelHe}</span>
              {o.nature && (
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  {natureLabelHe(o.nature)}
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && !canCreate && (
            <div className="cat-combo-empty muted">אין תוצאות</div>
          )}
          {canCreate && (
            <div className="cat-combo-create">
              <button
                type="button"
                className="cat-combo-option create"
                disabled={creating}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handleCreate()}
              >
                הוסף «{query.trim()}»
              </button>
              <label className="cat-combo-fixed">
                <input
                  type="checkbox"
                  checked={asFixed}
                  onChange={(e) => setAsFixed(e.target.checked)}
                />
                קבועה
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
