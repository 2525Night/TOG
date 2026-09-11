const SEED = {
  available: 3850,
  checking: 4200,
  reserved: 350,
  cash: 520,
  income: 15600,
  expenses: 9420,
  leftover: 3850,
  mood: "תזרים יציב",
  account: "עו״ש ראשי",
  goalName: "חופשה משפחתית",
  goalNow: 6200,
  goalTarget: 15000,
  goalPct: 41,
  fixed: [
    { name: "משכנתא", amt: 5100, h: 92 },
    { name: "סופר", amt: 2100, h: 48 },
    { name: "גנים/חינוך", amt: 1800, h: 40 },
    { name: "ביטוחים", amt: 420, h: 18 },
  ],
  txs: [
    { name: "משכורת", cat: "הכנסה", amt: 15600, when: "היום", dir: "INCOME", day: "היום" },
    { name: "משכנתא", cat: "דיור", amt: -5100, when: "אתמול", dir: "EXPENSE", day: "אתמול" },
    { name: "סופר ישפרו", cat: "מזון", amt: -312, when: "אתמול", dir: "EXPENSE", day: "אתמול" },
    { name: "משיכת מזומן · כספומט", cat: "מזומן", amt: -500, when: "ג׳", dir: "TRANSFER", day: "יום ד׳" },
    { name: "ביטוח רכב", cat: "ביטוח", amt: -420, when: "ב׳", dir: "EXPENSE", day: "יום ב׳" },
  ],
  months: [
    { key: "2026-01", label: "ינואר 2026" },
    { key: "2026-02", label: "פברואר 2026" },
    { key: "2026-03", label: "מרץ 2026" },
    { key: "2026-04", label: "אפריל 2026", future: true },
  ],
  weekRemain: 1283,
  nearObligations: 6550,
  pendingFixed: 2,
  cashLog: [
    { name: "משיכת מזומן · כספומט", amt: 500, kind: "in", when: "ג׳ · 14:20" },
    { name: "קפה", amt: -28, kind: "out", when: "ג׳ · 16:05" },
    { name: "ירקות בשוק", amt: -64, kind: "out", when: "אתמול" },
    { name: "חניה", amt: -15, kind: "out", when: "אתמול" },
  ],
  loan: { name: "הלוואת שיפוץ", left: 31800, original: 55000, monthly: 1450, rate: 6.2 },
  card: { name: "ישראכרט משפחה", used: 3600, limit: 18000 },
  card2: { name: "אמריקן אקספרס", used: 900, limit: 12000 },
  cats: [
    { name: "דיור", amt: 5100, pct: 54 },
    { name: "מזון", amt: 2100, pct: 22 },
    { name: "ילדים", amt: 1800, pct: 19 },
    { name: "ביטוח", amt: 420, pct: 5 },
  ],
  debtsOpen: 36300,
};

const nis = (n) => "₪" + Math.abs(Math.round(n)).toLocaleString("he-IL");

const PAGES = [
  { id: "home", label: "תמונת מצב", ico: "◎", kicker: "בהירות", hint: "תשובה · Void + Glass · בלי דוק (כמו במערכת)" },
  { id: "money", label: "תנועות", ico: "⇄", kicker: "עו״ש", hint: "דוק תחתון: תנועות · קבועים · ייבוא" },
  { id: "cash", label: "מעקב מזומן", ico: "₪", kicker: "כיס", hint: "דוק תחתון: יומן · משיכה · יתרה" },
  { id: "reports", label: "מאזן", ico: "▣", kicker: "ניתוח", hint: "דוק תחתון: סיכום · קטגוריות · מגמה" },
  { id: "debts", label: "אשראי והלוואות", ico: "◇", kicker: "בכבוד", hint: "דוק תחתון: סקירה · הלוואות · כרטיסי אשראי" },
  { id: "goals", label: "יעדים", ico: "○", kicker: "אש קטנה", hint: "דוק תחתון: יעדים · הקצאה · כרית" },
  { id: "roey", label: "Roey", ico: "✦", kicker: "מלווה", hint: "דוק תחתון: שיחה · לעשות · התאמה" },
  { id: "settings", label: "הגדרות", ico: "⚙", kicker: "שיתוף", hint: "בלי דוק · חיבור בנק עדיין לא זמין" },
];

let pageId = "home";
let menuOpen = true; /* פתוח בהתחלה כדי שיראו את התפריט הצדדי */
let moneyTab = 0;
let cashTab = 0;
let reportsTab = 1;
let debtsTab = 0;
let goalsTab = 0;
let roeyTab = 0;
let monthIdx = 2; /* מרץ 2026 — חודש הדמו */
let moneyDir = "ALL"; /* ALL | EXPENSE | INCOME | TRANSFER */
let moneyGroupByDay = false;
let moneyQ = "";
let moneyShowFlow = false;
let cashFilter = "all"; /* all | out | in | today */

function st() {
  return `<div class="st"><span>9:41</span><span>●●●</span></div>`;
}

function topBar() {
  return `
    <div class="top-bar">
      <button type="button" class="menu-btn" data-menu="open" aria-label="תפריט" aria-expanded="${menuOpen}">
        <span class="menu-btn__bars" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>תפריט</span>
      </button>
      <span class="top-brand">MoneyTail5</span>
    </div>`;
}

function drawer() {
  return `
    <div class="drawer-backdrop${menuOpen ? " open" : ""}" data-menu="close" aria-hidden="${!menuOpen}"></div>
    <aside class="drawer${menuOpen ? " open" : ""}" aria-label="תפריט ראשי">
      <div class="drawer-head">
        <div>
          <div class="drawer-brand">MoneTail</div>
          <p class="drawer-kicker">מסע הכסף · ניווט ראשי</p>
        </div>
        <button type="button" class="drawer-x" data-menu="close" aria-label="סגירת תפריט">×</button>
      </div>
      <nav class="drawer-nav">
        ${PAGES.map(
          (p) => `
          <button type="button" data-page="${p.id}" class="${p.id === pageId ? "active" : ""}">
            <span class="nav-ico" aria-hidden="true">${p.ico}</span>
            <span>${p.label}</span>
          </button>`
        ).join("")}
      </nav>
      <div class="drawer-foot"><span>MoneyTail5</span><span>יציאה</span></div>
    </aside>`;
}

function dock(labels, active, group, badges = {}) {
  return `<div class="page-dock" data-dock="${group}">${labels
    .map(
      (l, i) =>
        `<button type="button" data-dock-i="${i}" class="${i === active ? "on" : ""}">${l}${
          badges[i] ? `<span class="page-dock-badge">${badges[i]}</span>` : ""
        }</button>`
    )
    .join("")}</div>`;
}

function monthLabel() {
  return SEED.months[monthIdx]?.label || "מרץ 2026";
}

/** Shared month prev/next — Glass+Void period control (PeriodBar) */
function monthNav({ quiet = false, extra = "" } = {}) {
  const m = SEED.months[monthIdx];
  const canPrev = monthIdx > 0;
  const canNext = monthIdx < SEED.months.length - 1;
  return `
    <div class="period-bar${quiet ? " period-bar--quiet" : ""}">
      <div class="month-nav" role="group" aria-label="ניווט בין חודשים">
        <button type="button" class="month-nav-btn" data-month="-1" aria-label="חודש קודם" ${canPrev ? "" : "disabled"}>‹</button>
        <div class="month-nav-label">
          ${quiet ? "" : `<span class="month-nav-eyebrow">חודש</span>`}
          <strong>${m.label}${m.future ? " · עתידי" : ""}</strong>
        </div>
        <button type="button" class="month-nav-btn" data-month="1" aria-label="חודש הבא" ${canNext ? "" : "disabled"}>›</button>
      </div>
      ${extra ? `<div class="period-bar-extra">${extra}</div>` : ""}
    </div>`;
}

/** Shared page-hero atom — Home grammar for primary views */
function pageHero({ kicker = "", amount, unit = "", answer = "", size = "", support = "" } = {}) {
  const sizeCls = size ? ` pg-hero--${size}` : "";
  const supportHtml = support
    ? `<div class="pg-hero__support">${support}</div>`
    : "";
  return `
    <div class="pg-hero${sizeCls}">
      <div class="pg-hero__stage" aria-hidden="true"></div>
      ${kicker ? `<p class="pg-hero__kicker">${kicker}</p>` : ""}
      <div class="pg-hero__amt">${amount}${unit ? `<span class="pg-hero__unit">${unit}</span>` : ""}</div>
      <div class="pg-hero__line"></div>
      ${answer ? `<p class="pg-hero__ans">${answer}</p>` : ""}
      ${supportHtml}
    </div>`;
}

function shell(inner, dockHtml = "") {
  /* תפריט ראשי = סיידבר נשלף (כמו AppSidebar) — לא תחתון.
     דוק לעמוד = פס תחתון קבוע בתוך מסך הטלפון (thumb reach). */
  const hasDock = Boolean(dockHtml);
  return `<div class="ph${hasDock ? " has-page-dock" : ""}">${st()}${topBar()}<div class="body">${inner}</div>${dockHtml}${drawer()}</div>`;
}

function pageHome() {
  return shell(`
    ${monthNav({
      extra: `<span class="tx-in">הכנסות <b>${nis(SEED.income)}</b></span>
        <span class="tx-out">הוצאות <b>${nis(SEED.expenses)}</b></span>
        <span>תקציב · נותר החודש <b>${nis(SEED.leftover)}</b></span>`,
    })}
    <div class="home-stage">
      <div class="home-kicker">תמונת מצב · זמין בפועל</div>
      <div class="home-amt">${SEED.available.toLocaleString("he-IL")}<span class="home-unit">₪ · אחרי התחייבויות</span></div>
      <div class="home-line"></div>
      <p class="home-ans">${SEED.mood}. אפשר לנשום — ואז להחליט.</p>
      <div class="home-support">
        <span>בחשבון <b>${nis(SEED.checking)}</b></span>
        <span>שמור לתשלומים <b>${nis(SEED.reserved)}</b></span>
        <span>מזומן בכיס <b>${nis(SEED.cash)}</b></span>
      </div>
      <p class="home-week">נשאר השבוע · <b>${nis(SEED.weekRemain)}</b> · חלוקה ל־3 שבועות ב־${monthLabel()}</p>
      <div class="home-actions">
        <button type="button" class="home-cta">לטפל עכשיו</button>
        <button type="button" class="home-cta ghost">הוצאה מהירה</button>
      </div>
    </div>`);
}

function moneyDirCounts() {
  const c = { ALL: SEED.txs.length, EXPENSE: 0, INCOME: 0, TRANSFER: 0 };
  for (const t of SEED.txs) c[t.dir] = (c[t.dir] || 0) + 1;
  return c;
}

function filteredMoneyTxs() {
  const q = moneyQ.trim().toLowerCase();
  return SEED.txs.filter((t) => {
    if (moneyDir !== "ALL" && t.dir !== moneyDir) return false;
    if (!q) return true;
    return `${t.name} ${t.cat}`.toLowerCase().includes(q);
  });
}

function moneyFiltersBar() {
  const counts = moneyDirCounts();
  const dirs = [
    ["ALL", "הכל"],
    ["EXPENSE", "הוצאות"],
    ["INCOME", "הכנסות"],
    ["TRANSFER", "העברות"],
  ];
  return `
    <div class="money-filters" role="group" aria-label="סינון תנועות">
      <div class="dir-chips">
        ${dirs
          .map(
            ([key, label]) => `
          <button type="button" class="dir-chip${moneyDir === key ? " on" : ""}${
              key === "INCOME" ? " income" : key === "EXPENSE" ? " expense" : ""
            }" data-money-dir="${key}">
            ${label}<span class="dir-chip-count">${counts[key]}</span>
          </button>`
          )
          .join("")}
      </div>
      <div class="money-filter-tools">
        <label class="tx-search">
          <span class="tx-search-ico" aria-hidden="true">⌕</span>
          <input type="search" data-money-q placeholder="חיפוש לפי תיאור או קטגוריה" value="${moneyQ.replace(/"/g, "&quot;")}" autocomplete="off" />
          ${moneyQ ? `<button type="button" class="tx-search-clear" data-money-q-clear aria-label="נקה חיפוש">×</button>` : ""}
        </label>
        <button type="button" class="dir-chip tool${moneyGroupByDay ? " on" : ""}" data-money-group aria-pressed="${moneyGroupByDay}">לפי יום</button>
      </div>
    </div>`;
}

function renderMoneyFeed() {
  const rows = filteredMoneyTxs();
  if (!rows.length) {
    return `<div class="empty-state">אין תנועות שמתאימות לסינון</div>`;
  }
  if (!moneyGroupByDay) {
    return `<div class="feed">${rows
      .map(
        (x) => `
      <article class="tx">
        <div><b>${x.name}</b><span>${x.cat} · ${x.when}</span></div>
        <div class="amt ${x.amt > 0 ? "in" : "out"}">${x.amt > 0 ? "+" : "−"}${nis(x.amt)}</div>
      </article>`
      )
      .join("")}</div>`;
  }
  const groups = {};
  for (const x of rows) {
    const d = x.day || x.when;
    (groups[d] ||= []).push(x);
  }
  return `<div class="feed feed--grouped">${Object.entries(groups)
    .map(
      ([day, items]) => `
      <div class="day-group">
        <div class="day-label">${day}</div>
        ${items
          .map(
            (x) => `
        <article class="tx">
          <div><b>${x.name}</b><span>${x.cat}</span></div>
          <div class="amt ${x.amt > 0 ? "in" : "out"}">${x.amt > 0 ? "+" : "−"}${nis(x.amt)}</div>
        </article>`
          )
          .join("")}
      </div>`
    )
    .join("")}</div>`;
}

function pageMoney() {
  const d = dock(["תנועות", "קבועים", "ייבוא"], moneyTab, "money");
  const period = monthNav({
    extra: `<span>נותר החודש <b class="tx-in">${nis(SEED.leftover)}</b> · <button type="button" class="linkish" data-goto="goals">ליעדים ←</button></span>`,
  });
  if (moneyTab === 1) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "תנועות · קבועים",
        amount: SEED.expenses.toLocaleString("he-IL"),
        unit: "₪ · סה״כ קבועים החודש",
        answer: "קצב החיים — מה שחוזר כל חודש.",
        size: "sm",
      })}
      <div class="fixed-drum">${SEED.fixed
        .map(
          (f) =>
            `<div class="fixed-bar"><div class="fill" style="height:${f.h}%"><i>${nis(f.amt)}</i></div><div class="nm">${f.name}</div></div>`
        )
        .join("")}</div>
      <div class="center-note">${SEED.pendingFixed} הוצאות קבועות פתוחות לחודש · רשום מהצ׳יפים</div>`,
      d
    );
  }
  if (moneyTab === 2) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "תנועות · ייבוא",
        amount: "CSV",
        unit: "קובץ · לא חיבור בנק",
        answer: "הנח קובץ כאן — חיבור בנק עדיין לא זמין.",
        size: "sm",
      })}
      <div class="import-box">↑<b>הנח CSV כאן</b><p>ייבוא קובץ — לא חיבור בנק חי<br/>בהגדרות: חיבור בנק עדיין לא זמין</p></div>`,
      d
    );
  }
  return shell(
    `
    ${pageHero({
      kicker: "תנועות · יתרה בעו״ש",
      amount: SEED.checking.toLocaleString("he-IL"),
      unit: "₪ · עובר ושב",
      answer: "הכסף בתנועה — ואפשר לנשום.",
      support: `<span>${SEED.account}</span><span>מזומן בכיס <b>${nis(SEED.cash)}</b></span>`,
    })}
    ${period}
    <div class="month-flow-optional">
      <button type="button" class="flow-toggle" data-money-flow aria-expanded="${moneyShowFlow}">
        ${moneyShowFlow ? "הסתר סיכום חודש" : "הצג סיכום חודש (אופציונלי)"}
      </button>
      ${
        moneyShowFlow
          ? `<div class="month-flow-strip">
        <div class="flow-row"><span class="tx-in">הכנסות</span><b class="tx-in">${nis(SEED.income)}</b></div>
        <div class="flow-row"><span class="tx-out">הוצאות</span><b class="tx-out">${nis(SEED.expenses)}</b></div>
        <div class="flow-row"><span>ליעדים</span><b>${nis(400)}</b></div>
      </div>`
          : ""
      }
    </div>
    ${moneyFiltersBar()}
    ${
      SEED.pendingFixed > 0
        ? `<button type="button" class="pending-chip" data-money-tab="1">${SEED.pendingFixed} הוצאות קבועות פתוחות ←</button>`
        : ""
    }
    ${renderMoneyFeed()}
    <div class="fab-row"><span class="fab">+ הוצאה</span><span class="fab ghost">+ הכנסה</span></div>`,
    d
  );
}

function pageCash() {
  const d = dock(["יומן", "משיכה", "יתרה"], cashTab, "cash");
  const period = monthNav({
    extra: `<span>בכיס <b>${nis(SEED.cash)}</b> · לא יתרת עו״ש</span>`,
  });
  if (cashTab === 1) {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "."];
    return shell(
      `
      ${period}
      <div class="atm-stage">
        <div class="atm-label">משיכה לכיס · סכום</div>
        <div class="atm-amt">850<span>₪</span></div>
        <div class="atm-line"></div>
        <p class="atm-hint">− בעו״ש · + בכיס · בלי כפילות בהוצאות</p>
      </div>
      <div class="atm-pad">${keys.map((k) => `<span class="${k === "⌫" || k === "." ? "ghost" : ""}">${k}</span>`).join("")}</div>
      <button type="button" class="atm-go">רשום משיכה</button>
      <div class="center-note">עכשיו בכיס ${nis(SEED.cash)} · לא יתרת עו״ש</div>`,
      d
    );
  }
  if (cashTab === 2) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "יתרה · מזומן בכיס",
        amount: SEED.cash.toLocaleString("he-IL"),
        unit: "₪ · לא יתרת עו״ש",
        answer: "יתרת פתיחה מתעדכנת כאן — העו״ש לא זז.",
        size: "lg",
      })}
      <div class="fab-row"><span class="fab">עדכון יתרת פתיחה</span></div>`,
      d
    );
  }
  const filters = [
    ["all", "הכל"],
    ["out", "הוצאות"],
    ["in", "משיכות לכיס"],
    ["today", "היום"],
  ];
  const filtered = SEED.cashLog.filter((x) => {
    if (cashFilter === "out") return x.kind === "out";
    if (cashFilter === "in") return x.kind === "in";
    if (cashFilter === "today") return x.when.includes("ג׳");
    return true;
  });
  const filterLabel =
    cashFilter === "out"
      ? "הוצאות מהכיס"
      : cashFilter === "in"
        ? "משיכות לכיס"
        : cashFilter === "today"
          ? "היום"
          : "הכל";
  return shell(
    `
    ${pageHero({
      kicker: "מעקב מזומן · יומן",
      amount: SEED.cash.toLocaleString("he-IL"),
      unit: "₪ · בכיס עכשיו",
      answer: "יומן כיס — לא עו״ש.",
    })}
    ${period}
    <div class="filters" role="tablist" aria-label="סינון יומן מזומן">
      ${filters
        .map(
          ([key, label]) =>
            `<button type="button" class="${cashFilter === key ? "on" : ""}" data-cash-filter="${key}">${label}</button>`
        )
        .join("")}
    </div>
    <div class="filter-status">מציגים: ${filterLabel}${cashFilter !== "all" ? ` · ${filtered.length} מתוך ${SEED.cashLog.length}` : ""}</div>
    ${
      filtered.length
        ? `<div class="cash-list">${filtered
            .map(
              (x) => `
      <article class="cash-item ${x.kind}">
        <div class="when">${x.when}</div>
        <div><b>${x.name}</b><div class="sub">${x.kind === "in" ? "משיכה לכיס" : "הוצאת מזומן"}</div></div>
        <div class="amt">${x.kind === "in" ? "+" : "−"}${nis(x.amt)}</div>
      </article>`
            )
            .join("")}</div>`
        : `<div class="empty-state">אין רשומות במסנן הנוכחי לחודש זה — נסו «הכל».</div>`
    }
    <div class="fab-row"><span class="fab">שמור ביומן</span></div>`,
    d
  );
}

function pageReports() {
  const d = dock(["סיכום", "קטגוריות", "מגמה"], reportsTab, "reports");
  const net = SEED.income - SEED.expenses;
  const period = monthNav({
    extra: `<span class="tx-in">הכנסות <b>${nis(SEED.income)}</b></span>
      <span class="tx-out">הוצאות <b>${nis(SEED.expenses)}</b></span>
      <span>נותר החודש <b>${nis(SEED.leftover)}</b></span>`,
  });
  if (reportsTab === 0) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "מאזן · סיכום",
        amount: net.toLocaleString("he-IL"),
        unit: "₪ · נטו אחרי הוצאות",
        answer: "מה נכנס · מה יצא — תמונה אחת.",
        support: `<span>הכנסות <b>${nis(SEED.income)}</b></span><span>הוצאות <b>${nis(SEED.expenses)}</b></span>`,
      })}
      <div class="pl-grid">
        <div class="pl"><i>הכנסות</i><b>${nis(SEED.income)}</b></div>
        <div class="pl"><i>הוצאות</i><b>${nis(SEED.expenses)}</b></div>
        <div class="pl"><i>ליעדים</i><b>${nis(400)}</b></div>
        <div class="pl net"><i>נטו אחרי הוצאות וליעדים</i><b>${nis(net)}</b></div>
      </div>`,
      d
    );
  }
  if (reportsTab === 2) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "מאזן · מגמה",
        amount: net.toLocaleString("he-IL"),
        unit: "₪ · נטו החודש",
        answer: "שלושה חודשים — הכיוון עולה.",
        size: "sm",
      })}
      <div class="trend">
        <div class="col" style="--h:48%"><span>ינו׳</span></div>
        <div class="col" style="--h:62%"><span>פבר׳</span></div>
        <div class="col on" style="--h:78%"><span>מרץ</span></div>
      </div>
      <div class="trend-read">נטו עולה · ${nis(net)} החודש</div>`,
      d
    );
  }
  return shell(
    `
    ${period}
    ${pageHero({
      kicker: "מאזן · קטגוריות",
      amount: SEED.expenses.toLocaleString("he-IL"),
      unit: "₪ · סה״כ הוצאות",
      answer: "איך ההוצאות מתחלקות — בלי רעש.",
      size: "sm",
    })}
    ${SEED.cats
      .map(
        (c) => `
      <div class="cat-row">
        <span class="nm">${c.name}</span>
        <div class="track"><i style="width:${c.pct}%"></i></div>
        <span class="av">${nis(c.amt)}</span>
      </div>`
      )
      .join("")}`,
    d
  );
}

function pageDebts() {
  const d = dock(["סקירה", "הלוואות", "כרטיסי אשראי"], debtsTab, "debts");
  const loanPct = Math.round((1 - SEED.loan.left / SEED.loan.original) * 100);
  const period = monthNav();
  if (debtsTab === 1) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "הלוואות",
        amount: SEED.loan.left.toLocaleString("he-IL"),
        unit: "₪ · נשאר להחזיר",
        answer: `${SEED.loan.name} · הוחזר ${loanPct}%.`,
        size: "sm",
      })}
      <div class="loan-card">
        <div class="name">${SEED.loan.name}</div>
        <div class="left">${nis(SEED.loan.left)}</div>
        <div class="prog"><i style="width:${loanPct}%"></i></div>
        <div class="meta">הוחזר ${loanPct}% · ${nis(SEED.loan.monthly)}/חודש · ${SEED.loan.rate}%</div>
      </div>`,
      d
    );
  }
  if (debtsTab === 2) {
    const pct = Math.round((SEED.card.used / SEED.card.limit) * 100);
    const openCards = SEED.card.used + SEED.card2.used;
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "כרטיסי אשראי",
        amount: openCards.toLocaleString("he-IL"),
        unit: "₪ · אשראי פתוח",
        answer: "שני כרטיסים — בכבוד, בלי דרמה.",
        size: "sm",
      })}
      <div class="card-face">
        <div class="k" style="margin-bottom:0.25rem">כרטיס</div>
        <div class="name">${SEED.card.name}</div>
        <div class="used">${nis(SEED.card.used)}</div>
        <div class="meta">מתוך מסגרת ${nis(SEED.card.limit)}</div>
        <div class="horizon"><i style="width:${pct}%"></i></div>
        <div class="meta">זמין ${nis(SEED.card.limit - SEED.card.used)} · ${pct}% בשימוש</div>
      </div>
      <div class="card-mini">${SEED.card2.name} · ${nis(SEED.card2.used)}</div>`,
      d
    );
  }
  return shell(
    `
    ${period}
    ${pageHero({
      kicker: "אשראי והלוואות · בכבוד",
      amount: SEED.debtsOpen.toLocaleString("he-IL"),
      unit: "₪ · סה״כ פתוח",
      answer: "יש סכום פתוח — ויש אדם שמנהל אותו.",
      support: `<span>הלוואות <b>${nis(SEED.loan.left)}</b></span><span>אשראי שוטף <b>${nis(SEED.card.used + SEED.card2.used)}</b></span><span class="warn">קרוב החודש <b>${nis(SEED.nearObligations)}</b></span>`,
    })}
    <div class="split">
      <div class="half"><i>הלוואות</i><b>${nis(SEED.loan.left)}</b><span>${SEED.loan.name}</span></div>
      <div class="half"><i>אשראי שוטף</i><b>${nis(SEED.card.used + SEED.card2.used)}</b><span>2 כרטיסים</span></div>
    </div>
    <div class="calm">לחץ תזרימי · <b>בשליטה</b> · תשלומים קרובים מכוסים</div>`,
    d
  );
}

function pageGoals() {
  const d = dock(["יעדים", "הקצאה", "כרית"], goalsTab, "goals");
  const period = monthNav({
    extra: `<span>פנוי להקצאה <b class="warm">${nis(SEED.leftover)}</b></span>`,
  });
  if (goalsTab === 1) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "הקצאה",
        amount: "400",
        unit: "₪ · להקצות עכשיו",
        answer: "הוראת קבע קטנה · אש לא כבה.",
        size: "sm",
      })}
      <div class="alloc">
        <div class="row"><span>מנותר החודש</span><b>${nis(SEED.leftover)}</b></div>
        <div class="row"><span>להקצות עכשיו</span><b class="warm">${nis(400)}</b></div>
        <div class="row"><span>ליעד</span><b>${SEED.goalName}</b></div>
      </div>
      <div class="fab-row"><span class="fab">אשר הקצאה</span></div>`,
      d
    );
  }
  if (goalsTab === 2) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "כרית",
        amount: `${SEED.goalPct}%`,
        unit: "לכיוון ביטחון",
        answer: `רזרבה להפתעות · מתוך ${nis(SEED.goalTarget)}.`,
        size: "sm",
      })}
      <div class="cushion">
        <div class="orb"><div class="lvl" style="height:${SEED.goalPct}%"></div><div class="txt"><div class="l">נפח כרית</div><div class="a">${nis(SEED.goalNow)}</div></div></div>
      </div>
      <div class="center-note">מטרה נפוצה: כ־1–3 חודשי הוצאות</div>`,
      d
    );
  }
  return shell(
    `
    ${period}
    ${pageHero({
      kicker: "יעדים · אש קטנה",
      amount: `${SEED.goalPct}%`,
      unit: `${nis(SEED.goalNow)} · מתוך ${nis(SEED.goalTarget)}`,
      answer: "המטרה גדולה. הצעד קטן.",
    })}
    <div class="goal-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#7db8a8"/>
            <stop offset="100%" stop-color="#d4894a"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" class="bg"/>
        <circle cx="60" cy="60" r="52" class="fg" stroke="url(#goalGrad)" style="stroke-dasharray:${SEED.goalPct * 3.27} 327"/>
      </svg>
      <div class="center"><div class="l">${SEED.goalPct}%</div><div class="a">${nis(SEED.goalNow)}</div></div>
    </div>
    <div class="goal-name">${SEED.goalName}</div>
    <div class="goal-meta">מתוך ${nis(SEED.goalTarget)} · יעד חדש</div>`,
    d
  );
}

function pageRoey() {
  const d = dock(["שיחה", "לעשות", "התאמה"], roeyTab, "roey", { 1: 2 });
  const period = monthNav({ quiet: true });
  if (roeyTab === 1) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "המלווה הפיננסי שלך",
        amount: "2",
        unit: "ממתינים · לעשות",
        answer: "אותות קטנים — בלי לחץ.",
        size: "sm",
      })}
      <div class="todo-stack">
        <article><div class="badge">Roey שם לב</div><p>משכנתא בעוד 4 ימים · ${nis(SEED.loan.monthly)}</p><span>הזכר לי בעוד שבוע</span></article>
        <article><div class="badge">המלצה</div><p>להקצות ${nis(400)} לחופשה מהנותר</p><span>פתח הקצאה</span></article>
      </div>`,
      d
    );
  }
  if (roeyTab === 2) {
    return shell(
      `
      ${period}
      ${pageHero({
        kicker: "התאמה",
        amount: "Roey",
        unit: "חיבור · Google AI Studio",
        answer: "בלי חיבור — אין תשובות חיות.",
        size: "sm",
      })}
      <div class="connect">
        <p>חברו את Roey ל-Google AI Studio</p>
        <span class="fab">להתאמת החיבור</span>
        <small>בלי חיבור — אין תשובות חיות</small>
      </div>`,
      d
    );
  }
  /* Chat opens straight into companion UI — no void-hero metric block */
  return shell(
    `
    ${period}
    <div class="chat chat--open">
      <div class="msg me"><div class="who">אתה</div><p>מה מצב החודש שלי?</p></div>
      <div class="msg"><div class="who">Roey</div><p>אפשר לנשום. רוצה שאבדוק הקצאה קטנה לחופשה?</p></div>
      <div class="starters"><span>מה מסכן אותי?</span><span>תחזית 90 יום</span></div>
    </div>
    <div class="compose"><div class="field">שאלו את Roey…</div><button type="button">↑</button></div>`,
    d
  );
}

function pageSettings() {
  return shell(`
    ${pageHero({
      kicker: "הגדרות · שיתוף",
      amount: "מסע",
      unit: "שותפים וחיבורים",
      answer: "אותה תמונת מצב · אותו מסע כסף.",
      size: "sm",
    })}
    <div class="settings-block">
      <h3>שותפים במסע</h3>
      <p>אותה תמונת מצב · אותו מסע כסף</p>
      <div class="mirrors">
        <div class="face"><div class="av">א</div><div class="nm">את/ה</div><div class="rl">מנהל/ת</div></div>
        <div class="face"><div class="av">+</div><div class="nm">הזמנה</div><div class="rl">שותף/ה</div></div>
      </div>
    </div>
    <div class="settings-void">
      <p class="sv-kicker">חיבור בנק</p>
      <p class="sv-stmt">חיבור בנק עדיין לא זמין</p>
      <div class="sv-line"></div>
      <button type="button" class="sv-cta">לייבוא קובץ בתנועות</button>
      <p class="sv-note">ייבוא CSV זמין · תנועות ← ייבוא</p>
    </div>`);
}

const renderers = {
  home: pageHome,
  money: pageMoney,
  cash: pageCash,
  reports: pageReports,
  debts: pageDebts,
  goals: pageGoals,
  roey: pageRoey,
  settings: pageSettings,
};

const sideNav = document.getElementById("side-nav");
const screen = document.getElementById("screen");

function bind() {
  screen.querySelectorAll("[data-menu]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = el.getAttribute("data-menu");
      menuOpen = act === "open" ? !menuOpen : false;
      paint();
    });
  });
  screen.querySelectorAll(".drawer-nav [data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pageId = btn.dataset.page;
      menuOpen = false;
      paint();
    });
  });
  screen.querySelectorAll("[data-dock]").forEach((dockEl) => {
    const group = dockEl.dataset.dock;
    dockEl.querySelectorAll("[data-dock-i]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.dockI);
        if (group === "money") moneyTab = i;
        if (group === "cash") cashTab = i;
        if (group === "reports") reportsTab = i;
        if (group === "debts") debtsTab = i;
        if (group === "goals") goalsTab = i;
        if (group === "roey") roeyTab = i;
        paint();
      });
    });
  });
  screen.querySelectorAll("[data-month]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.month);
      const next = monthIdx + delta;
      if (next < 0 || next >= SEED.months.length) return;
      monthIdx = next;
      paint();
    });
  });
  screen.querySelectorAll("[data-money-dir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      moneyDir = btn.dataset.moneyDir;
      paint();
    });
  });
  screen.querySelectorAll("[data-money-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      moneyGroupByDay = !moneyGroupByDay;
      paint();
    });
  });
  screen.querySelectorAll("[data-money-flow]").forEach((btn) => {
    btn.addEventListener("click", () => {
      moneyShowFlow = !moneyShowFlow;
      paint();
    });
  });
  screen.querySelectorAll("[data-money-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      moneyTab = Number(btn.dataset.moneyTab);
      paint();
    });
  });
  screen.querySelectorAll("[data-money-q-clear]").forEach((btn) => {
    btn.addEventListener("click", () => {
      moneyQ = "";
      paint();
    });
  });
  const qInput = screen.querySelector("[data-money-q]");
  if (qInput) {
    qInput.addEventListener("input", () => {
      moneyQ = qInput.value;
      const start = qInput.selectionStart;
      paint();
      const again = screen.querySelector("[data-money-q]");
      if (again) {
        again.focus();
        try {
          again.setSelectionRange(start, start);
        } catch (_) {
          /* ignore */
        }
      }
    });
  }
  screen.querySelectorAll("[data-cash-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cashFilter = btn.dataset.cashFilter;
      paint();
    });
  });
  screen.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pageId = btn.dataset.goto;
      menuOpen = false;
      paint();
    });
  });
}

function paint() {
  const page = PAGES.find((p) => p.id === pageId);
  sideNav.querySelectorAll("button").forEach((b) => {
    if (b.dataset.page === pageId) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  });
  document.getElementById("kicker").textContent = page.kicker;
  document.getElementById("title").textContent = page.label;
  document.getElementById("hint").textContent = page.hint;
  screen.innerHTML = renderers[pageId]();
  bind();
}

PAGES.forEach((p) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.page = p.id;
  btn.innerHTML = `<span class="lab-ico">${p.ico}</span> ${p.label}`;
  btn.addEventListener("click", () => {
    pageId = p.id;
    menuOpen = false;
    paint();
  });
  sideNav.appendChild(btn);
});

paint();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuOpen) {
    menuOpen = false;
    paint();
    return;
  }
  const i = PAGES.findIndex((p) => p.id === pageId);
  if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    pageId = PAGES[(i + 1) % PAGES.length].id;
    menuOpen = false;
    paint();
  }
  if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    pageId = PAGES[(i - 1 + PAGES.length) % PAGES.length].id;
    menuOpen = false;
    paint();
  }
});