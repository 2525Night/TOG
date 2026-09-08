type FeelCard = {
  emo: string;
  title: string;
  text: string;
  hold?: boolean;
};

type FeelRowProps = {
  items: [FeelCard, FeelCard, FeelCard];
};

/** להבין · להרגיש · לעשות — Layered Clarity emotional layer. */
export function FeelRow({ items }: FeelRowProps) {
  return (
    <section className="mt-feel-row" aria-label="איך להרגיש עם המידע">
      {items.map((item) => (
        <article
          key={item.emo}
          className={`mt-feel-card${item.hold ? " hold" : ""}`}
        >
          <div className="emo">{item.emo}</div>
          <strong>{item.title}</strong>
          <p>{item.text}</p>
        </article>
      ))}
    </section>
  );
}
