type PulseTone = "boost" | "hold" | "win" | "";

type PulseProps = {
  label: string;
  title: string;
  text: string;
  tone?: PulseTone;
  mark?: string;
};

/** Compact emotional/product signal — Layered Clarity. */
export function Pulse({
  label,
  title,
  text,
  tone = "boost",
  mark = "♥",
}: PulseProps) {
  const toneClass = tone ? ` ${tone}` : "";
  return (
    <aside className={`mt-pulse${toneClass}`} aria-label={label}>
      <div className="mt-pulse-mark" aria-hidden="true">
        {mark}
      </div>
      <div className="mt-pulse-body">
        <div className="mt-pulse-label">{label}</div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </aside>
  );
}
