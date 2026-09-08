type WinStripProps = {
  items: Array<{ label: string; value: string }>;
};

/** Compact win / progress pills — Layered Clarity. */
export function WinStrip({ items }: WinStripProps) {
  if (!items.length) return null;
  return (
    <div className="mt-win-strip" aria-label="ניצחונות קטנים">
      {items.map((item) => (
        <span key={`${item.label}-${item.value}`} className="mt-win-pill">
          {item.label}: <b>{item.value}</b>
        </span>
      ))}
    </div>
  );
}
