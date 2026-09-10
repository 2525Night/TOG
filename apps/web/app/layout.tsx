import type { Metadata, Viewport } from "next";
import { Heebo, Rubik } from "next/font/google";
import { MobileNativeShell } from "@/components/MobileNativeShell";
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
  title: "MoneyTail5 — מסע הכסף",
  description:
    "מלווה אתכם במסע הכסף: מעקב, דפוסים והצעד הבא — בעברית ובשקלים",
  icons: {
    icon: [{ url: "/app-icon.png", type: "image/png" }],
    apple: [{ url: "/app-icon.png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MoneyTail5",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#15202b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${rubik.variable}`}>
      <body>
        <MobileNativeShell />
        {children}
      </body>
    </html>
  );
}
