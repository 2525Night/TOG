import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הורדת MoneyTail5 לאנדרואיד",
  description: "התקנת אפליקציית MoneyTail5 לטלפון אנדרואיד",
  robots: { index: false, follow: false },
};

export default function DownloadPage() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.25rem",
        background:
          "radial-gradient(ellipse 70% 40% at 15% 0%, rgba(125,184,168,0.16), transparent 55%), radial-gradient(ellipse 55% 35% at 90% 10%, rgba(224,163,90,0.1), transparent 50%), #0e151c",
        color: "#f3f7fa",
        fontFamily: "var(--font-body), Heebo, Segoe UI, Tahoma, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(100%, 420px)",
          textAlign: "center",
          display: "grid",
          gap: "1.1rem",
          justifyItems: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/app-icon.png"
          alt="MoneyTail5"
          width={96}
          height={96}
          style={{ borderRadius: 22, boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}
        />
        <h1 style={{ margin: 0, fontSize: "1.55rem", letterSpacing: "-0.02em" }}>
          MoneyTail5 לאנדרואיד
        </h1>
        <p style={{ margin: 0, color: "rgba(243,247,250,0.68)", lineHeight: 1.55, maxWidth: "34ch" }}>
          גרסה 5.2 · אייקון לוגו B · התקינו על הטלפון. אם כבר מותקנת גרסה ישנה — זה יעדכן אותה.
        </p>
        <a
          href="/downloads/MoneyTail5.apk"
          download="MoneyTail5.apk"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 48,
            padding: "0.85rem 1.4rem",
            borderRadius: 14,
            background: "#7db8a8",
            color: "#0e151c",
            fontWeight: 800,
            textDecoration: "none",
            width: "100%",
            maxWidth: 280,
          }}
        >
          הורדת התקנה (APK)
        </a>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(243,247,250,0.5)", lineHeight: 1.45 }}>
          אחרי ההורדה פתחו את הקובץ בטלפון ואשרו התקנה ממקור חיצוני אם תתבקשו.
        </p>
      </section>
    </main>
  );
}
