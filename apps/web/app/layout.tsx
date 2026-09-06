import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyTail — תמונת מצב כלכלית",
  description: "מערכת בינה פיננסית אישית לישראל",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
