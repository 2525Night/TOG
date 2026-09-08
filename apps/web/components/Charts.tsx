"use client";

type Point = {
  label: string;
  income: number;
  expense: number;
  toGoals?: number;
  net: number;
};

export function MomBars({ series }: { series: Point[] }) {
  const max = Math.max(
    1,
    ...series.flatMap((p) => [
      p.income,
      p.expense,
      p.toGoals || 0,
      Math.abs(p.net),
    ]),
  );

  return (
    <div
      className="chart-bars"
      role="img"
      aria-label="מגמת הכנסות, הוצאות וליעדים"
    >
      {series.map((p) => (
        <div className="chart-col" key={p.label}>
          <div className="chart-pair">
            <div
              className="bar income"
              style={{ height: `${(p.income / max) * 100}%` }}
              title={`הכנסות ${Math.round(p.income)}`}
            />
            <div
              className="bar expense"
              style={{ height: `${(p.expense / max) * 100}%` }}
              title={`הוצאות ${Math.round(p.expense)}`}
            />
            {(p.toGoals || 0) > 0.005 && (
              <div
                className="bar goals"
                style={{ height: `${((p.toGoals || 0) / max) * 100}%` }}
                title={`ליעדים ${Math.round(p.toGoals || 0)}`}
              />
            )}
          </div>
          <div className="chart-label">{p.label.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

export function CategoryBars({
  items,
  hrefFor,
}: {
  items: Array<{
    key?: string;
    labelHe: string;
    amount: number;
    sharePct?: number;
  }>;
  hrefFor?: (item: {
    key?: string;
    labelHe: string;
  }) => string | undefined;
}) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  return (
    <div className="cat-bars">
      {items.map((item) => {
        const href = hrefFor?.(item);
        const inner = (
          <>
            <div className="cat-meta">
              <strong>{item.labelHe}</strong>
              <span className="muted">
                ₪{Math.round(item.amount).toLocaleString("he-IL")}
                {item.sharePct != null ? ` · ${item.sharePct}%` : ""}
              </span>
            </div>
            <div className="cat-track">
              <div
                className="cat-fill"
                style={{ width: `${(item.amount / max) * 100}%` }}
              />
            </div>
          </>
        );
        if (href) {
          return (
            <a className="cat-row cat-row-link" key={item.key || item.labelHe} href={href}>
              {inner}
            </a>
          );
        }
        return (
          <div className="cat-row" key={item.key || item.labelHe}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

type BudgetSlice = {
  key: string;
  labelHe: string;
  amount: number;
  color: string;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
) {
  const large = end - start > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, start);
  const o2 = polar(cx, cy, rOuter, end);
  const i1 = polar(cx, cy, rInner, end);
  const i2 = polar(cx, cy, rInner, start);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    "Z",
  ].join(" ");
}

/** How this month's goal pool is split: allocated · standing · free. */
export function GoalsPoolPie({
  allocated,
  plannedStanding,
  free,
  hint,
}: {
  allocated: number;
  plannedStanding: number;
  free: number;
  hint?: string;
}) {
  const slices: BudgetSlice[] = [
    {
      key: "allocated",
      labelHe: "כבר ליעדים החודש",
      amount: Math.max(0, allocated),
      color: "color-mix(in srgb, var(--accent) 78%, #0b3d3a)",
    },
    {
      key: "planned",
      labelHe: "ממתין בהוראת קבע",
      amount: Math.max(0, plannedStanding),
      color: "color-mix(in srgb, var(--accent-2) 75%, #c45c14)",
    },
    {
      key: "free",
      labelHe: "פנוי להקצאה",
      amount: Math.max(0, free),
      color: "color-mix(in srgb, var(--accent) 42%, #b8ebe0)",
    },
  ].filter((s) => s.amount > 0.005);

  const total =
    slices.reduce((s, x) => s + x.amount, 0) ||
    Math.max(allocated + plannedStanding + free, 1);
  const cx = 60;
  const cy = 60;
  const rOuter = 52;
  const rInner = 33;

  let angle = 0;
  const paths = slices.map((s) => {
    const sweep = (s.amount / total) * 360;
    const start = angle;
    const end = angle + Math.max(sweep, 0.5);
    angle = end;
    return { ...s, d: donutSlice(cx, cy, rOuter, rInner, start, end) };
  });

  const empty = slices.length === 0;
  const legendItems = empty
    ? [
        {
          key: "allocated",
          labelHe: "כבר ליעדים החודש",
          amount: Math.max(0, allocated),
          color: "color-mix(in srgb, var(--accent) 78%, #0b3d3a)",
        },
        {
          key: "planned",
          labelHe: "ממתין בהוראת קבע",
          amount: Math.max(0, plannedStanding),
          color: "color-mix(in srgb, var(--accent-2) 75%, #fff)",
        },
        {
          key: "free",
          labelHe: "פנוי להקצאה",
          amount: Math.max(0, free),
          color: "color-mix(in srgb, var(--accent) 42%, #b8ebe0)",
        },
      ]
    : slices;

  return (
    <div
      className="goals-pool-pie"
      role="img"
      aria-label={`פנוי להקצאה ${Math.round(free).toLocaleString("he-IL")} שקלים. כבר ליעדים ${Math.round(allocated).toLocaleString("he-IL")}`}
    >
      <div className="goals-pool-pie-main">
        <div className="budget-pie-visual goals-pool-pie-visual">
          <svg viewBox="0 0 120 120" width="148" height="148" aria-hidden>
            {empty ? (
              <circle
                cx={cx}
                cy={cy}
                r={(rOuter + rInner) / 2}
                fill="none"
                stroke="var(--border)"
                strokeWidth={rOuter - rInner}
              />
            ) : paths.length === 1 ? (
              <circle
                cx={cx}
                cy={cy}
                r={(rOuter + rInner) / 2}
                fill="none"
                stroke={paths[0].color}
                strokeWidth={rOuter - rInner}
              />
            ) : (
              paths.map((p) => <path key={p.key} d={p.d} fill={p.color} />)
            )}
            <circle cx={cx} cy={cy} r={rInner - 1} fill="#fff" />
          </svg>
        </div>

        <div className="goals-pool-pie-aside">
          <p className="goals-pool-pie-caption">איך מתחלק החודש</p>
          <ul className="goals-pool-pie-legend">
            {legendItems.map((s) => (
              <li key={s.key}>
                <span
                  className="budget-pie-swatch"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="goals-pool-pie-leg-label">{s.labelHe}</span>
                <strong
                  className={`goals-pool-pie-leg-amt goals-pool-pie-leg-amt--${s.key}`}
                  style={
                    s.key === "free"
                      ? { color: "var(--accent-strong)" }
                      : { color: s.color }
                  }
                >
                  ₪{Math.round(s.amount).toLocaleString("he-IL")}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {hint ? <p className="muted goals-pool-pie-hint">{hint}</p> : null}
    </div>
  );
}

/** How this month's income is split: fixed · flexible · goals · leftover. */
export function BudgetPie({
  income,
  fixed,
  flexible,
  leftover,
  toGoals = 0,
}: {
  income: number;
  fixed: number;
  flexible: number;
  leftover: number;
  toGoals?: number;
}) {
  const slices: BudgetSlice[] = [
    {
      key: "fixed",
      labelHe: "קבועים",
      amount: Math.max(0, fixed),
      color: "var(--accent-2)",
    },
    {
      key: "flexible",
      labelHe: "גמיש",
      amount: Math.max(0, flexible),
      color: "var(--accent-orange)",
    },
    {
      key: "toGoals",
      labelHe: "ליעדים",
      amount: Math.max(0, toGoals),
      color: "var(--accent-warm)",
    },
    {
      key: "leftover",
      labelHe: "נותר",
      amount: Math.max(0, leftover),
      color: "var(--accent)",
    },
  ].filter((s) => s.amount > 0.005);

  const total = slices.reduce((s, x) => s + x.amount, 0) || Math.max(income, 1);
  const cx = 60;
  const cy = 60;
  const rOuter = 52;
  const rInner = 32;

  let angle = 0;
  const paths = slices.map((s) => {
    const sweep = (s.amount / total) * 360;
    const start = angle;
    const end = angle + Math.max(sweep, 0.4);
    angle = end;
    return { ...s, d: donutSlice(cx, cy, rOuter, rInner, start, end) };
  });

  const empty = slices.length === 0;

  return (
    <div className="budget-pie" role="img" aria-label="חלוקת ההכנסות החודש">
      <div className="budget-pie-visual">
        <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden>
          {empty ? (
            <circle
              cx={cx}
              cy={cy}
              r={(rOuter + rInner) / 2}
              fill="none"
              stroke="var(--border)"
              strokeWidth={rOuter - rInner}
            />
          ) : paths.length === 1 ? (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={(rOuter + rInner) / 2}
                fill="none"
                stroke={paths[0].color}
                strokeWidth={rOuter - rInner}
              />
            </>
          ) : (
            paths.map((p) => (
              <path key={p.key} d={p.d} fill={p.color} />
            ))
          )}
          <circle cx={cx} cy={cy} r={rInner - 1} fill="var(--bg-elevated)" />
        </svg>
        <div className="budget-pie-center">
          <span className="muted">הכנסות</span>
          <strong className="tx-in">
            ₪{Math.round(income).toLocaleString("he-IL")}
          </strong>
        </div>
      </div>
      <ul className="budget-pie-legend">
        {(
          empty
            ? [
                {
                  key: "fixed",
                  labelHe: "קבועים",
                  amount: Math.max(0, fixed),
                  color: "var(--accent-2)",
                },
                {
                  key: "flexible",
                  labelHe: "גמיש",
                  amount: Math.max(0, flexible),
                  color: "var(--accent-orange)",
                },
                {
                  key: "toGoals",
                  labelHe: "ליעדים",
                  amount: Math.max(0, toGoals),
                  color: "var(--accent-warm)",
                },
                {
                  key: "leftover",
                  labelHe: "נותר",
                  amount: Math.max(0, leftover),
                  color: "var(--accent)",
                },
              ]
            : slices
        ).map((s) => {
          const pct = total ? Math.round((s.amount / total) * 100) : 0;
          return (
            <li key={s.key}>
              <span
                className="budget-pie-swatch"
                style={{ background: s.color }}
                aria-hidden
              />
              <span className="budget-pie-label">{s.labelHe}</span>
              <strong>
                ₪{Math.round(s.amount).toLocaleString("he-IL")}
              </strong>
              <span className="muted">{pct}%</span>
            </li>
          );
        })}
        {leftover < -0.005 && (
          <li>
            <span
              className="budget-pie-swatch"
              style={{ background: "var(--danger)" }}
              aria-hidden
            />
            <span className="budget-pie-label">גירעון</span>
            <strong className="tx-out">
              ₪{Math.round(Math.abs(leftover)).toLocaleString("he-IL")}
            </strong>
          </li>
        )}
      </ul>
    </div>
  );
}
