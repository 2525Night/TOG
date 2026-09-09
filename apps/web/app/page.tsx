import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";

export default function HomePage() {
  return (
    <main className="auth-shell auth-shell--phone auth-shell--mood home-gate">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן
      </a>
      <div className="auth-brand-plane" id="main-content">
        <section className="auth-brand-copy auth-rise">
          <p className="home-kicker">משקפים · מחליטים · מתקדמים</p>
          <div className="home-brand-block">
            <BrandLockup size="lg" />
            <span className="home-edition" aria-label="MoneyTail5">
              MoneyTail<span>5</span>
            </span>
          </div>
          <h1 className="home-lead">
            מלווה אתכם במסע הכסף — ממעקב ודפוסים עד הצעד הבא
          </h1>
          <p className="home-support">
            אפשר להתחיל מכל מקום. לוקחים את הכסף קדימה — ביחד.
          </p>
          <div className="auth-cta-row home-cta-row">
            <Link className="btn auth-submit home-cta-primary" href="/register">
              בואו נתחיל את המסע
            </Link>
            <Link className="home-cta-secondary" href="/login">
              כבר בדרך? התחברות
            </Link>
          </div>
        </section>
        <aside className="auth-panel auth-rise auth-rise-delay" aria-label="שערי כניסה למסע">
          <p className="auth-panel-title">אפשר להתחיל מכל מקום</p>
          <ul className="home-journey-list">
            <li>
              <strong>מעקב</strong>
              <span>לראות לאן הכסף באמת הולך</span>
            </li>
            <li>
              <strong>דפוסים</strong>
              <span>להבין מה חוזר ומה משתנה</span>
            </li>
            <li>
              <strong>הצעד הבא</strong>
              <span>להתקדם קדימה — בקצב שלכם</span>
            </li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
