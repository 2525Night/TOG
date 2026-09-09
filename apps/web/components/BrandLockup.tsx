/** Website lockup: ○ M Tail's 5 — not the app icon. */
type BrandLockupProps = {
  size?: "sm" | "md" | "lg";
  /** Dark glyphs for light surfaces (e.g. mobile topbar). */
  onLight?: boolean;
};

export function BrandLockup({ size = "md", onLight = false }: BrandLockupProps) {
  const className = [
    "brand-lockup",
    size === "sm" ? "brand-lockup--sm" : null,
    size === "lg" ? "brand-lockup--lg" : null,
    onLight ? "brand-lockup--on-light" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} aria-label="MoneyTail5">
      <i className="ring" aria-hidden="true" />
      <b className="m">M</b>
      <b className="tail">Tail</b>
      <b className="ess">s</b>
      <b className="five" aria-hidden="true">
        5
      </b>
    </span>
  );
}
