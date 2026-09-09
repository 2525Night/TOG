import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";

/** Interim forgot-password — no reset flow yet; clear next step for users. */
export default function ForgotPasswordPage() {
  return (
    <main className="auth-shell auth-shell--phone">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy">
          <BrandLockup size="lg" onLight />
          <p>נחזיר אתכם לתמונה — בלי לחץ.</p>
        </section>
        <div className="auth-panel">
          <h1 className="auth-panel-title">שכחתי סיסמה</h1>
          <p className="auth-help-body">
            איפוס סיסמה אוטומטי עדיין לא פעיל בשלב זה. בינתיים אפשר:
          </p>
          <ul className="auth-help-list">
            <li>לנסות להתחבר עם האימייל — סיסמה עדיין אופציונלית בחשבונות
              שלא הוגדרה בהם סיסמה.</li>
            <li>
              לפנות אלינו באימייל{" "}
              <a href="mailto:uriyossef@gmail.com">uriyossef@gmail.com</a>{" "}
              ונאפס ידנית.
            </li>
          </ul>
          <Link className="btn auth-submit" href="/login">
            חזרה להתחברות
          </Link>
          <p className="muted" style={{ marginBottom: 0, marginTop: "0.85rem" }}>
            חדשים כאן? <Link href="/register">הצטרפות קצרה</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
