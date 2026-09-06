import Link from "next/link";

export default function HomePage() {
  return (
    <main className="auth-shell">
      <section className="card" style={{ padding: "2rem 1.5rem", maxWidth: 520 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          ישראל · ש״ח · עברית
        </p>
        <h1 style={{ fontSize: "2.5rem", margin: "0.2rem 0 0.6rem" }}>
          Money<span style={{ color: "var(--accent-strong)" }}>Tail</span>
        </h1>
        <p style={{ fontSize: "1.12rem", lineHeight: 1.65, marginBottom: "1.4rem" }}>
          מערכת בינה פיננסית אישית: תמונת מצב שקופה, זיהוי דפוסים, והמלצות לפי
          היעדים שלך — בלי תלות בחיבור בנק.
        </p>
        <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/register">
            התחילו עכשיו
          </Link>
          <Link className="btn secondary" href="/login">
            התחברות
          </Link>
        </div>
        <p className="muted" style={{ marginTop: "1.4rem", fontSize: "0.9rem" }}>
          העוזר Roey יהיה זמין כאופציה משנית — לא כמסך הראשי.
        </p>
      </section>
    </main>
  );
}
