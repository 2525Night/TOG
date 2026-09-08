import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";

export default function HomePage() {
  return (
    <main className="auth-shell">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy">
          <p className="muted" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            בעברית · בשקלים · בקצב שלכם
          </p>
          <BrandLockup size="lg" onLight />
          <p>
            מקום שקט להבין מה קורה עם הכסף — בלי מונחים מפחידים ובלי עומס.
          </p>
          <div className="auth-cta-row">
            <Link className="btn" href="/register">
              בואו נתחיל
            </Link>
            <Link className="btn secondary" href="/login">
              כבר יש לי חשבון
            </Link>
          </div>
        </section>
        <aside className="auth-panel" aria-label="מה מחכה לכם">
          <p className="auth-panel-title">מה תראו כאן</p>
          <ul
            className="muted"
            style={{ margin: 0, paddingInlineStart: "1.1rem", lineHeight: 1.75 }}
          >
            <li>כמה באמת פנוי אחרי מה שצריך לרדת</li>
            <li>הלוואות וכרטיסים — בנפרד, בלי בלבול</li>
            <li>יעדים בקצב שלכם, בלי לחץ</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
