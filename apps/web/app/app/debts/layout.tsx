"use client";

/** Route group shell for /app/debts/* — keeps client boundaries stable. */
export default function DebtsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="debts-area">{children}</div>;
}
