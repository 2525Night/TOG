import type { Metadata } from "next";
import { Heebo, Rubik } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-body",
  display: "swap",
});

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MoneyTail — תמונת מצב כלכלית",
  description: "מערכת בינה פיננסית אישית לישראל",
  icons: {
    icon: [{ url: "/app-icon.png", type: "image/png" }],
    apple: [{ url: "/app-icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${rubik.variable}`}>
      <body>{children}</body>
    </html>
  );
}
