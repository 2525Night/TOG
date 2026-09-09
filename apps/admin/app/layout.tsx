import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MoneyTail5 Admin",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          fontFamily: "Segoe UI, Heebo, Assistant, Tahoma, sans-serif",
          background: "#111827",
          color: "#f9fafb",
        }}
      >
        {children}
      </body>
    </html>
  );
}
