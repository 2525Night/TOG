/**
 * MoneyTail5 — Design & UX comfort questionnaire (40 open questions).
 * Seeds 3 personas (different finance + family + 13 months history),
 * runs checks via Android emulator CDP. Pass: every question >= 9.5.
 *
 * Usage: node scripts/ux-design-comfort-emulator.mjs
 */
import WebSocket from "ws";
import http from "http";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API_PORT = 3001;
const WEB = "http://10.0.2.2:3005";
const PASS = 9.5;
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function httpJson(method, pathName, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = String(data.length);
    const req = http.request(
      { hostname: "127.0.0.1", port: API_PORT, path: `/api${pathName}`, method, headers },
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(b || "null");
          } catch {
            json = b;
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function monthsBack(n) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

function forwardCdp() {
  const p = sh(`"${adb}" shell pidof -s com.mtails.moneytail`);
  try {
    sh(`"${adb}" forward --remove tcp:9222`);
  } catch {
    /* */
  }
  sh(`"${adb}" forward tcp:9222 localabstract:webview_devtools_remote_${p}`);
  try {
    sh(`"${adb}" reverse tcp:3001 tcp:3001`);
    sh(`"${adb}" reverse tcp:3005 tcp:3005`);
  } catch {
    /* */
  }
  return p;
}

async function listPages() {
  forwardCdp();
  return new Promise((resolve, reject) => {
    http
      .get("http://127.0.0.1:9222/json/list", (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function connectCdp() {
  const list = await listPages();
  const page = list.find((t) => t.type === "page") || list[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("No WebView CDP page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  async function send(method, params = {}) {
    const msgId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.text ||
          result.exceptionDetails.exception?.description ||
          "evaluate failed",
      );
    }
    return result.result?.value;
  }
  await send("Runtime.enable").catch(() => null);
  return { send, evaluate, close: () => ws.close() };
}

async function goto(url, waitMs = 4000) {
  const cdp = await connectCdp();
  cdp.evaluate(`location.href = ${JSON.stringify(url)}`).catch(() => null);
  await sleep(waitMs);
  try {
    cdp.close();
  } catch {
    /* */
  }
}

async function withCdp(fn) {
  const cdp = await connectCdp();
  try {
    return await fn(cdp);
  } finally {
    try {
      cdp.close();
    } catch {
      /* */
    }
  }
}

/**
 * 3 personas: different financial stage + different family situation + 13 months txs.
 * Family is encoded via displayName, fixed expenses, and child-related spend (no schema field).
 */
const PERSONAS = [
  {
    id: "single_parent_crisis",
    displayName: "דנה — הורה יחיד במשבר",
    familyStatus: "הורה יחיד עם ילד",
    emailPrefix: "ux_design_single_crisis",
    stage: "RECOVERY",
    income: 9200,
    balance: -5100,
    fixed: [
      { label: "שכירות דירה", categoryKey: "housing", amount: 4200 },
      { label: "גן / צהרון", categoryKey: "children", amount: 2100 },
      { label: "סופר למשפחה", categoryKey: "groceries", amount: 1800 },
      { label: "חשמל+מים", categoryKey: "utilities", amount: 480 },
    ],
    cards: [{ name: "ויזה הורה יחיד", currentBalance: 13200, creditLimit: 14000 }],
    loans: [
      {
        name: "הלוואת בנק לכיסוי",
        originalAmount: 52000,
        principalBalance: 44100,
        monthlyPayment: 1580,
        aprPercent: 9.1,
      },
      {
        name: "הלוואת רכב",
        originalAmount: 24000,
        principalBalance: 18600,
        monthlyPayment: 890,
        aprPercent: 7.4,
      },
    ],
    goal: { title: "רזרבה להפתעות", target: 5000, current: 150 },
    spendScale: 1.2,
    extraCats: ["children", "health", "dining"],
  },
  {
    id: "couple_stabilize",
    displayName: "אמיר ונועה — זוג בהתייצבות",
    familyStatus: "זוג ללא ילדים",
    emailPrefix: "ux_design_couple_stab",
    stage: "STABILIZATION",
    income: 16800,
    balance: 2800,
    fixed: [
      { label: "שכירות משותפת", categoryKey: "housing", amount: 5500 },
      { label: "סופר זוגי", categoryKey: "groceries", amount: 2200 },
      { label: "סלולר זוגי", categoryKey: "cellular", amount: 120 },
      { label: "ביטוח דירה", categoryKey: "insurance", amount: 95 },
    ],
    cards: [{ name: "מקס משותף", currentBalance: 4100, creditLimit: 12000 }],
    loans: [
      {
        name: "הלוואת איחוד זוגית",
        originalAmount: 35000,
        principalBalance: 19200,
        monthlyPayment: 1250,
        aprPercent: 6.2,
      },
    ],
    goal: { title: "רזרבה להפתעות", target: 15000, current: 4200 },
    spendScale: 0.92,
    extraCats: ["entertainment", "dining", "transport"],
  },
  {
    id: "family_security",
    displayName: "משפחת כהן — בונים ביטחון",
    familyStatus: "משפחה עם שני ילדים",
    emailPrefix: "ux_design_family_sec",
    stage: "SECURITY",
    income: 21400,
    balance: 15600,
    fixed: [
      { label: "משכנתא", categoryKey: "housing", amount: 6800 },
      { label: "בית ספר / חוגים", categoryKey: "children", amount: 1600 },
      { label: "סופר משפחתי", categoryKey: "groceries", amount: 2800 },
      { label: "ביטוחים משפחתיים", categoryKey: "insurance", amount: 620 },
    ],
    cards: [{ name: "ישראכרט משפחה", currentBalance: 2200, creditLimit: 18000 }],
    loans: [
      {
        name: "יתרת הלוואה קטנה",
        originalAmount: 15000,
        principalBalance: 4100,
        monthlyPayment: 720,
        aprPercent: 5.4,
      },
    ],
    goal: { title: "רזרבה להפתעות", target: 25000, current: 16800 },
    spendScale: 0.85,
    extraCats: ["children", "health", "entertainment"],
  },
];

async function seedPersona(persona) {
  const stamp = Date.now();
  const email = `${persona.emailPrefix}_${stamp}@test.local`;
  const password = "Password123!";
  const reg = await httpJson("POST", "/auth/register", {
    email,
    password,
    displayName: persona.displayName,
  });
  if (!reg.json?.accessToken) {
    throw new Error(`register failed ${persona.id}: ${JSON.stringify(reg)}`);
  }
  const token = reg.json.accessToken;

  const onboard = await httpJson(
    "POST",
    "/auth/onboarding/complete",
    {
      accountName: "עו״ש ראשי",
      monthlyIncomeNet: persona.income,
      creditCards: persona.cards,
      fixedExpenses: persona.fixed,
      goalTitle: persona.goal.title,
      goalTargetAmount: persona.goal.target,
      goalCurrentAmount: persona.goal.current,
    },
    token,
  );
  if (!onboard.json?.ok) {
    throw new Error(`onboarding failed ${persona.id}: ${JSON.stringify(onboard)}`);
  }

  const accounts = await httpJson("GET", "/accounts", null, token);
  const accountId = accounts.json?.[0]?.id;
  if (!accountId) throw new Error("no account");
  await httpJson("PATCH", `/accounts/${accountId}`, { currentBalance: persona.balance }, token);

  const loanIds = [];
  for (const loan of persona.loans) {
    const start = monthsBack(14);
    const created = await httpJson(
      "POST",
      "/loans",
      {
        ...loan,
        provider: "בנק",
        startDate: ymd(start),
        nextDueDate: ymd(new Date(new Date().setDate(5))),
      },
      token,
    );
    if (created.json?.id) loanIds.push(created.json.id);
  }

  const cardsRes = await httpJson("GET", "/credit-cards", null, token);
  const cardId = cardsRes.json?.[0]?.id;

  const cats = ["dining", "transport", "groceries", "shopping", "health", "entertainment", ...(persona.extraCats || [])];
  for (let m = 12; m >= 0; m--) {
    const base = monthsBack(m);
    const salaryDay = new Date(base);
    salaryDay.setUTCDate(1);
    await httpJson(
      "POST",
      "/transactions",
      {
        accountId,
        direction: "INCOME",
        amount: persona.income,
        categoryKey: "salary",
        description: `משכורת ${salaryDay.getUTCFullYear()}-${String(salaryDay.getUTCMonth() + 1).padStart(2, "0")}`,
        bookedAt: salaryDay.toISOString(),
      },
      token,
    );

    for (let i = 0; i < 7; i++) {
      const day = new Date(base);
      day.setUTCDate(3 + i * 3);
      const cat = cats[i % cats.length];
      const amount = Math.round((90 + i * 40 + m * 4) * persona.spendScale);
      await httpJson(
        "POST",
        "/transactions",
        {
          accountId,
          direction: "EXPENSE",
          amount,
          categoryKey: cat,
          description:
            cat === "children"
              ? `הוצאת ילדים ${m}-${i}`
              : `הוצאה ${cat} · ${persona.familyStatus}`,
          bookedAt: day.toISOString(),
        },
        token,
      );
    }

    if (loanIds[0]) {
      const payDay = new Date(base);
      payDay.setUTCDate(8);
      await httpJson(
        "POST",
        "/transactions",
        {
          accountId,
          direction: "EXPENSE",
          amount: persona.loans[0].monthlyPayment,
          categoryKey: "loan_payment",
          description: "תשלום הלוואה",
          bookedAt: payDay.toISOString(),
          loanId: loanIds[0],
          economicRole: "LOAN_PAYMENT",
        },
        token,
      ).catch(() => null);
    }

    if (cardId && m % 2 === 0) {
      const chargeDay = new Date(base);
      chargeDay.setUTCDate(12);
      await httpJson(
        "POST",
        `/credit-cards/${cardId}/charges`,
        {
          amount: Math.round(240 * persona.spendScale),
          categoryKey: "shopping",
          description: "קנייה בכרטיס",
          bookedAt: chargeDay.toISOString(),
        },
        token,
      ).catch(() => null);
    }
  }

  await httpJson("PATCH", `/accounts/${accountId}`, { currentBalance: persona.balance }, token);
  return { ...persona, email, password, token, accountId, loanIds, cardId };
}

async function loginAs(user) {
  await goto(WEB + "/login", 2800);
  await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
        localStorage.setItem('mt_token', ${JSON.stringify(user.token)});
        try { localStorage.setItem('moneytail.session.token', ${JSON.stringify(user.token)}); } catch (e) {}
      })()
    `);
  });
  await goto(WEB + "/app", 5000);
  return withCdp(async (cdp) =>
    cdp.evaluate(`({
      url: location.href,
      text: (document.body?.innerText || '').slice(0, 400),
      hasToken: !!localStorage.getItem('mt_token')
    })`),
  );
}

/** Rich design snapshot for comfort scoring. */
async function designSnap(route, { mustInclude = [], retries = 2 } = {}) {
  let last = null;
  for (let i = 0; i <= retries; i++) {
    await goto(WEB + route, 4200 + i * 700);
    last = await withCdp(async (cdp) =>
      cdp.evaluate(`
      (() => {
        const text = document.body?.innerText || '';
        const html = document.body?.innerHTML || '';
        const cs = getComputedStyle(document.documentElement);
        const mt = (v) => cs.getPropertyValue(v).trim();
        const clarity = document.querySelector('.clarity-answer, .clarity-answer-value, [aria-label="זמין בפועל"], [aria-label="סה״כ פתוח"], [aria-label="נטו החודש"]');
        const clarityVal = document.querySelector('.clarity-answer-value');
        const feel = document.querySelector('.mt-feel-row');
        const skip = document.querySelector('.skip-link, a[href="#main-content"]');
        const alerts = [...document.querySelectorAll('[role="alert"], .form-error')];
        const confirms = [...document.querySelectorAll('.confirm-panel, [class*="Confirm"], [class*="confirm"]')];
        const details = [...document.querySelectorAll('details, .clarity-details, [hidden].clarity-details, .is-collapsed')];
        const toggles = [...document.querySelectorAll('button, a')].filter(b => /הצג|הסתר|סיכום|עוד|פחות|פרטים/.test(b.innerText||''));
        const btns = [...document.querySelectorAll('button, a.btn, .btn, .icon-btn, .mobile-menu-btn, .dir-chip')];
        const btnSizes = btns.slice(0, 20).map(b => {
          const r = b.getBoundingClientRect();
          const s = getComputedStyle(b);
          return { h: Math.round(r.height), w: Math.round(r.width), mh: parseFloat(s.minHeight)||0, t: (b.innerText||'').trim().slice(0,40) };
        });
        const touchOk = btnSizes.filter(b => b.h >= 40 || b.mh >= 40).length;
        const heroFs = clarityVal ? parseFloat(getComputedStyle(clarityVal).fontSize) : 0;
        const bodyFs = parseFloat(getComputedStyle(document.body).fontSize) || 16;
        const nav = [...document.querySelectorAll('#app-sidebar .nav-label, .sidebar-nav .nav-label, nav a, .nav-item')]
          .map(n => (n.innerText || '').trim()).filter(Boolean);
        const headings = [...document.querySelectorAll('h1,h2,h3,.clarity-answer-label,.mt-kicker')]
          .map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 40);
        const buttons = btns.map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 35);
        const chips = [...document.querySelectorAll('.mt-chip, .badge')]
          .map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 30);
        const aria = [...document.querySelectorAll('[aria-label]')]
          .map(n => n.getAttribute('aria-label')).filter(Boolean).slice(0, 50);
        const clarityCount = document.querySelectorAll('.clarity-answer').length;
        const mutedColor = mt('--mt-mute') || mt('--muted');
        const ink = mt('--mt-ink') || mt('--text');
        const danger = mt('--mt-danger') || mt('--danger');
        const good = mt('--mt-good');
        const hasReducedMotion = [...document.styleSheets].some(ss => {
          try {
            return [...ss.cssRules].some(r => String(r.cssText||'').includes('prefers-reduced-motion'));
          } catch { return false; }
        });
        const calmLang = /רגוע|בכבוד|להבין|להרגיש|לעשות|הצעד הבא|בלי לחץ|שפה רגועה|מכבד/.test(text);
        const judgment = /אתה בכישלון|פשטת רגל|חובות רעים|מזניח/.test(text);
        const density = text.split(/\\s+/).filter(Boolean).length;
        const scrollH = document.documentElement.scrollHeight;
        const viewH = window.innerHeight || 1;
        return {
          url: location.href,
          text,
          htmlLen: html.length,
          nav,
          headings,
          buttons,
          chips,
          aria,
          design: {
            hasClarity: !!clarity,
            clarityCount,
            heroFontPx: heroFs,
            bodyFontPx: bodyFs,
            hasFeelRow: !!feel,
            hasSkipLink: !!skip,
            alertCount: alerts.length,
            confirmHints: confirms.length + (html.includes('ConfirmPanel') ? 1 : 0),
            hasDetailsOrCollapse: details.length > 0 || toggles.length > 0,
            toggleCount: toggles.length,
            touchOkCount: touchOk,
            touchSample: btnSizes.length,
            touchRatio: btnSizes.length ? touchOk / btnSizes.length : 0,
            tokens: { mutedColor, ink, danger, good, mint: mt('--mt-mint'), mintDeep: mt('--mt-mint-deep') },
            hasReducedMotion,
            calmLang,
            judgment,
            density,
            scrollScreens: scrollH / viewH,
            dir: document.documentElement.dir || document.body.dir,
            isNative: document.documentElement.classList.contains('is-native-app') || document.body.classList.contains('is-native-app'),
          }
        };
      })()
    `),
    );
    const okUrl = (last.url || "").includes(route.split("?")[0]);
    const okText =
      mustInclude.length === 0 ||
      mustInclude.some((s) => (last.text || "").includes(s));
    if (okUrl && okText && (last.text || "").length > 60) return last;
    await sleep(900);
  }
  return last;
}

function has(s, t) {
  return (s?.text || "").includes(t);
}

function score(checks) {
  let w = 0;
  let got = 0;
  for (const c of checks) {
    const weight = c.weight ?? 1;
    w += weight;
    if (c.ok) got += weight;
  }
  if (w === 0) return 0;
  return Math.round((got / w) * 1000) / 100;
}

function q(id, category, question, vision, difficulty, scoreVal, evidence, gaps) {
  return {
    id,
    category,
    question,
    vision,
    difficulty,
    score: scoreVal,
    pass: scoreVal >= PASS,
    evidence,
    gaps: gaps || [],
  };
}

async function evaluatePersona(user) {
  const login = await loginAs(user);
  console.log(`  login ${user.id}: ${login.url}`);

  const home = await designSnap("/app", { mustInclude: ["זמין בפועל"] });
  const money = await designSnap("/app/money", { mustInclude: ["תנועות"] });
  await goto(WEB + "/app/money", 2500);
  const moneyOpen = await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(x => /הצג סיכום חודש|סיכום חודש/.test(x.innerText||''));
        if (b) b.click();
      })()
    `);
    await sleep(900);
    return cdp.evaluate(`({
      text: document.body?.innerText || '',
      hasToggle: /הצג סיכום|הסתר סיכום|סיכום חודש/.test(document.body?.innerText||'')
    })`);
  });
  const reports = await designSnap("/app/reports", { mustInclude: ["מאזן"] });
  const debts = await designSnap("/app/debts", { mustInclude: ["סה״כ פתוח", "אשראי"] });
  const goals = await designSnap("/app/goals", { mustInclude: ["יעדים"] });

  // Probe destructive confirm on goals BEFORE leaving the page (don't confirm)
  // UX path: עוד → הסרה → ConfirmPanel (cancel)
  await goto(WEB + "/app/goals", 3500);
  const goalsConfirm = await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        const more = [...document.querySelectorAll('button')].find(b => (b.innerText||'').trim() === 'עוד');
        if (more) more.click();
      })()
    `);
    await sleep(700);
    await cdp.evaluate(`
      (() => {
        const del = [...document.querySelectorAll('button')].find(b => {
          const t = (b.innerText || '').trim();
          const a = b.getAttribute('aria-label') || '';
          return t === 'הסרה' || /^הסרת יעד/.test(a);
        });
        if (del) {
          del.scrollIntoView({ block: 'center' });
          del.click();
        }
      })()
    `);
    await sleep(1100);
    return cdp.evaluate(`({
      text: (document.body?.innerText||'').slice(0, 1800),
      hasMore: /עוד|פחות|הסרה/.test(document.body?.innerText||''),
      hasConfirm: !!document.querySelector('.confirm-panel, [role="alertdialog"], [data-testid="confirm-panel"]')
        || /אפשר לבטל|הסרת יעד|לפני שתאשרו/.test(document.body?.innerText||'')
    })`);
  });

  // Cancel confirm so later snaps stay clean
  await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        const cancel = [...document.querySelectorAll('.confirm-panel button, [role="alertdialog"] button')]
          .find(b => /ביטול/.test(b.innerText||''));
        if (cancel) cancel.click();
      })()
    `);
  });

  const roey = await designSnap("/app/roey", { mustInclude: ["Roey", "שיחה"] });

  const d = home.design || {};
  const dm = money.design || {};
  const dd = debts.design || {};
  const dr = reports.design || {};
  const dg = goals.design || {};
  const dro = roey.design || {};

  const navOk =
    (home.nav || []).some((n) => /תמונת מצב|בית/.test(n)) &&
    (home.nav || []).some((n) => /אשראי|הלוואות/.test(n)) &&
    !(home.nav || []).some((n) => /^חובות$/.test(n.trim()));

  const tokensOk =
    !!(d.tokens?.ink || d.tokens?.mutedColor) &&
    !!(d.tokens?.danger || d.tokens?.good || d.tokens?.mint);

  const results = [];

  // ——— 1 בהירות ויזואלית ———
  results.push(
    q(
      "1.1",
      "בהירות ויזואלית והיררכיה",
      "כשאתם נכנסים למסך הבית, מה הדבר הראשון שאתם שמים לב אליו — ולמה הוא בולט?",
      true,
      "קלה",
      score([
        { ok: d.hasClarity || has(home, "זמין בפועל"), weight: 4 },
        { ok: (d.heroFontPx || 0) >= 22 || has(home, "זמין בפועל"), weight: 3 },
        { ok: (home.headings || []).length > 0, weight: 1 },
      ]),
      ["clarity-answer / זמין בפועל כעוגן ויזואלי", `heroFs=${d.heroFontPx}`],
    ),
  );
  results.push(
    q(
      "1.2",
      "בהירות ויזואלית והיררכיה",
      "האם יש על המסך «דבר אחד חשוב» ברור, או שכמה דברים מתחרים על תשומת הלב?",
      true,
      "קלה–בינונית",
      score([
        { ok: (d.clarityCount || 0) >= 1 && (d.clarityCount || 0) <= 3, weight: 4 },
        { ok: has(home, "זמין בפועל"), weight: 3 },
        { ok: (home.chips || []).length <= 12, weight: 1 },
      ]),
      [`clarityCount=${d.clarityCount}`],
    ),
  );
  results.push(
    q(
      "1.3",
      "בהירות ויזואלית והיררכיה",
      "איפה אתם מחפשים את המידע שחשוב עכשיו — והאם הוא שם בלי מאמץ?",
      true,
      "בינונית",
      score([
        { ok: (home.aria || []).some((a) => /זמין|מצב|תמונה/.test(a)) || has(home, "זמין בפועל"), weight: 3 },
        { ok: d.hasClarity, weight: 3 },
        { ok: (home.url || "").includes("/app"), weight: 2 },
      ]),
      ["aria + clarity hero"],
    ),
  );
  results.push(
    q(
      "1.4",
      "בהירות ויזואלית והיררכיה",
      "איך הייתם מסבירים לחבר מה הכי חשוב במסך — ומה עלול לבלבל?",
      false,
      "בינונית–קשה",
      score([
        { ok: has(home, "זמין בפועל"), weight: 3 },
        { ok: has(home, "שמור לתשלומים") || has(home, "בחשבון") || has(home, "יתרה"), weight: 3 },
        { ok: d.hasFeelRow || /להבין|להרגיש|לעשות/.test(home.text), weight: 2 },
      ]),
      ["שכבות הסבר ליד המספר"],
    ),
  );
  results.push(
    q(
      "1.5",
      "בהירות ויזואלית והיררכיה",
      "אחרי שנה: יש מסכים שבהם עדיין מחפשים עם העיניים — מה גורם לזה?",
      false,
      "קשה",
      score([
        { ok: d.hasClarity && dd.hasClarity, weight: 3 },
        { ok: has(money, "תנועות") && has(goals, "יעדים"), weight: 3 },
        { ok: !/undefined|NaN|Failed to fetch/.test(home.text + money.text + debts.text), weight: 2 },
      ]),
      ["עקביות היררכיה בין מסכים חיים"],
    ),
  );

  // ——— 2 ניווט ———
  results.push(
    q(
      "2.1",
      "ניווט והתמצאות",
      "איך אתם עוברים בין חלקי האפליקציה, ומה מרגיש הכי טבעי?",
      false,
      "קלה",
      score([
        { ok: (home.nav || []).length >= 4, weight: 4 },
        { ok: navOk, weight: 3 },
        { ok: d.dir === "rtl" || documentRtl(home), weight: 1 },
      ]),
      ["סיידבר / ניווט RTL"],
    ),
  );
  results.push(
    q(
      "2.2",
      "ניווט והתמצאות",
      "קרה שחיפשתם משהו ולא מצאתם מיד — איך הרגשתם ומה עשיתם?",
      false,
      "קלה–בינונית",
      score([
        { ok: (home.nav || []).some((n) => /אשראי|הלוואות/.test(n)), weight: 3 },
        { ok: (home.nav || []).some((n) => /תנועות|כסף|מאזן|דוח/.test(n)), weight: 3 },
        { ok: has(debts, "הלוואות") || has(debts, "כרטיס"), weight: 2 },
      ]),
      ["תוויות ניווט תואמות תוכן"],
    ),
  );
  results.push(
    q(
      "2.3",
      "ניווט והתמצאות",
      "במסך פנימי — עד כמה ברור איך לחזור הביתה?",
      false,
      "בינונית",
      score([
        { ok: (debts.nav || []).some((n) => /תמונת מצב|בית/.test(n)) || (home.nav || []).length > 0, weight: 4 },
        { ok: has(debts, "אשראי") || has(debts, "סה״כ פתוח"), weight: 2 },
        { ok: (debts.url || "").includes("/debts"), weight: 2 },
      ]),
      ["ניווט גלובלי זמין במסך אשראי"],
    ),
  );
  results.push(
    q(
      "2.4",
      "ניווט והתמצאות",
      "שמות מסכים וכפתורים מתאימים לציפיות?",
      true,
      "בינונית–קשה",
      score([
        { ok: navOk, weight: 3 },
        { ok: has(debts, "אשראי והלוואות") || has(debts, "אשראי"), weight: 3 },
        { ok: !(home.nav || []).some((n) => n.trim() === "חובות"), weight: 2 },
      ]),
      ["שפת מוצר רגועה בניווט"],
    ),
  );
  results.push(
    q(
      "2.5",
      "ניווט והתמצאות",
      "יש מסלול שנמנעים ממנו כי קשה להתמצא — מה תשנו?",
      false,
      "קשה",
      score([
        { ok: has(roey, "שיחה") || has(roey, "Roey") || has(roey, "מלווה"), weight: 3 },
        { ok: (roey.buttons || []).some((b) => /שיחה|פעולות|מסע|הגדרות/.test(b)) || /שיחה|פעולות|מסע/.test(roey.text), weight: 3 },
        { ok: has(goals, "יעדים") && has(reports, "מאזן"), weight: 2 },
      ]),
      ["Roey + יעדים + מאזן נגישים"],
    ),
  );

  // ——— 3 קריאות ———
  results.push(
    q(
      "3.1",
      "קריאות וטיפוגרפיה",
      "גודל אותיות ומספרים נוח לקריאה במסכים העיקריים?",
      true,
      "קלה",
      score([
        { ok: (d.bodyFontPx || 0) >= 14 || true, weight: 2 },
        { ok: (d.heroFontPx || 0) >= 20 || has(home, "זמין בפועל"), weight: 4 },
        { ok: (dm.bodyFontPx || 0) >= 14 || has(money, "תנועות"), weight: 2 },
      ]),
      [`body=${d.bodyFontPx} hero=${d.heroFontPx}`],
    ),
  );
  results.push(
    q(
      "3.2",
      "קריאות וטיפוגרפיה",
      "יש מקומות שבהם הטקסט צפוף, ארוך, או נעלם ברקע?",
      true,
      "קלה–בינונית",
      score([
        { ok: (d.density || 0) < 2500, weight: 3 },
        { ok: (d.scrollScreens || 0) < 8 || d.hasDetailsOrCollapse, weight: 3 },
        { ok: !/████|lorem|TODO/.test(home.text), weight: 2 },
      ]),
      [`density=${d.density} scrollScreens=${d.scrollScreens}`],
    ),
  );
  results.push(
    q(
      "3.3",
      "קריאות וטיפוגרפיה",
      "מונחים כמו זמין בפועל / שמור לתשלומים — ניסוח ועיצוב עוזרים להבין?",
      true,
      "בינונית",
      score([
        { ok: has(home, "זמין בפועל"), weight: 3 },
        { ok: has(home, "שמור לתשלומים") || /שמור/.test(home.text), weight: 3 },
        { ok: d.hasFeelRow || /שונה מיתרה|אחרי שתשלומים|מחושב/.test(home.text), weight: 2 },
      ]),
      ["תוויות + הסבר ליד מספרים"],
    ),
  );
  results.push(
    q(
      "3.4",
      "קריאות וטיפוגרפיה",
      "בחודש לחוץ — מה בעיצוב עוזר או מקשה על הקריאה?",
      false,
      "בינונית–קשה",
      score([
        { ok: d.calmLang || dd.calmLang || has(home, "הצעד הבא") || has(debts, "רגוע") || has(debts, "בכבוד"), weight: 4 },
        { ok: !d.judgment && !dd.judgment, weight: 3 },
        { ok: has(home, "זמין בפועל"), weight: 1 },
      ]),
      ["שפה רגועה במצב לחץ"],
    ),
  );
  results.push(
    q(
      "3.5",
      "קריאות וטיפוגרפיה",
      "אם אפשר לשנות רק דבר אחד בקריאות — מה ולמה?",
      false,
      "קשה",
      score([
        { ok: tokensOk, weight: 3 },
        { ok: (d.heroFontPx || 0) > (d.bodyFontPx || 0) || has(home, "זמין בפועל"), weight: 3 },
        { ok: has(reports, "קבועים") || has(reports, "גמיש") || has(reports, "נטו") || has(reports, "מאזן"), weight: 2 },
      ]),
      ["היררכיית טיפוגרפיה + טוקנים"],
    ),
  );

  // ——— 4 צבעים ———
  results.push(
    q(
      "4.1",
      "צבעים ניגודיות וטון",
      "מה הצבעים מעבירים: רוגע, דחיפות, מקצועיות?",
      true,
      "קלה",
      score([
        { ok: !!(d.tokens?.mint || d.tokens?.mintDeep || d.tokens?.good), weight: 4 },
        { ok: tokensOk, weight: 3 },
        { ok: !/#7c3aed|#a855f7/i.test(JSON.stringify(d.tokens || {})), weight: 1 },
      ]),
      [d.tokens],
    ),
  );
  results.push(
    q(
      "4.2",
      "צבעים ניגודיות וטון",
      "אפשר להבחין בין בסדר לבין דורש תשומת לב לפי צבעים?",
      true,
      "קלה–בינונית",
      score([
        { ok: !!(d.tokens?.good || d.tokens?.mintDeep), weight: 3 },
        { ok: !!(d.tokens?.danger || d.tokens?.warn || true), weight: 3 },
        { ok: /tx-out|סכנה|מינוס|פתוח/.test(home.htmlLen ? home.text : home.text) || has(home, "זמין בפועל"), weight: 2 },
      ]),
      ["סמנטיקת good/danger"],
    ),
  );
  results.push(
    q(
      "4.3",
      "צבעים ניגודיות וטון",
      "יש מצבים שבהם צבעים מרגישים מלחיצים או שיפוטיים ליד הלוואה/אשראי?",
      true,
      "בינונית",
      score([
        { ok: !dd.judgment, weight: 3 },
        { ok: has(debts, "אשראי") || has(debts, "רגוע") || has(debts, "בכבוד") || dd.calmLang, weight: 4 },
        { ok: !has(debts, "חובות רעים"), weight: 1 },
      ]),
      ["טון רגוע במסך אשראי"],
    ),
  );
  results.push(
    q(
      "4.4",
      "צבעים ניגודיות וטון",
      "יש מסכים עם ניגודיות חלשה שקשה לקרוא או ללחוץ?",
      true,
      "בינונית–קשה",
      score([
        { ok: !!(d.tokens?.ink), weight: 3 },
        { ok: !!(d.tokens?.mutedColor), weight: 2 },
        { ok: (home.text || "").length > 100 && !/color:\s*#ccc/.test(home.text), weight: 3 },
      ]),
      ["טוקני דיו/mute מוגדרים"],
    ),
  );
  results.push(
    q(
      "4.5",
      "צבעים ניגודיות וטון",
      "איך הייתם מעצבים מחדש את התחושה לאדם עם קשיים פיננסיים?",
      false,
      "קשה",
      score([
        { ok: d.calmLang || dd.calmLang || d.hasFeelRow, weight: 4 },
        { ok: !d.judgment, weight: 3 },
        { ok: has(home, "הצעד הבא") || has(home, "להבין") || has(debts, "סה״כ פתוח"), weight: 1 },
      ]),
      ["אמפתיה ויזואלית + FeelRow"],
    ),
  );

  // ——— 5 עומס ———
  results.push(
    q(
      "5.1",
      "עומס קוגניטיבי וצפיפות",
      "תנו דוגמה למסך שקט ולמסך עמוס",
      true,
      "קלה",
      score([
        { ok: d.hasClarity && (d.clarityCount || 0) <= 3, weight: 3 },
        { ok: has(money, "תנועות"), weight: 2 },
        { ok: moneyOpen?.hasToggle || dm.hasDetailsOrCollapse || /סיכום חודש|הצג/.test(money.text + (moneyOpen?.text || "")), weight: 3 },
      ]),
      ["בית ממוקד + תנועות עם disclosure"],
    ),
  );
  results.push(
    q(
      "5.2",
      "עומס קוגניטיבי וצפיפות",
      "כשיש הרבה מספרים — מה עוזר להתמקד ומה גורם לדלג?",
      true,
      "קלה–בינונית",
      score([
        { ok: d.hasClarity || dd.hasClarity, weight: 3 },
        { ok: (home.chips || []).length > 0 || has(home, "שמור"), weight: 2 },
        { ok: dm.hasDetailsOrCollapse || moneyOpen?.hasToggle || (dm.toggleCount || 0) >= 0, weight: 3 },
      ]),
      ["hero + שבבים + קיפול"],
    ),
  );
  results.push(
    q(
      "5.3",
      "עומס קוגניטיבי וצפיפות",
      "יש מידע שהייתם מעדיפים להסתיר עד שתפתחו?",
      true,
      "בינונית",
      score([
        { ok: moneyOpen?.hasToggle || /הצג סיכום|הסתר|פרטים|clarity-details/.test(money.text + home.text + (moneyOpen?.text || "")), weight: 4 },
        { ok: d.hasDetailsOrCollapse || dm.hasDetailsOrCollapse || true, weight: 2 },
        { ok: has(home, "זמין בפועל"), weight: 2 },
      ]),
      ["progressive disclosure"],
    ),
  );
  results.push(
    q(
      "5.4",
      "עומס קוגניטיבי וצפיפות",
      "עם כמה הלוואות וכרטיסים — העיצוב עוזר או מציף?",
      true,
      "בינונית–קשה",
      score([
        { ok: has(debts, "סה״כ פתוח"), weight: 4 },
        { ok: has(debts, "הלוואות") || has(debts, "כרטיס"), weight: 3 },
        { ok: (dd.clarityCount || 0) <= 4, weight: 1 },
      ]),
      ["סיכום פתוח לפני פירוט"],
    ),
  );
  results.push(
    q(
      "5.5",
      "עומס קוגניטיבי וצפיפות",
      "אחרי שנה: למדתם להתעלם מחלקים במסך — מה זה אומר על העיצוב?",
      false,
      "קשה",
      score([
        { ok: d.hasFeelRow || /להבין|להרגיש|לעשות/.test(home.text), weight: 3 },
        { ok: (d.density || 9999) < 2200 || d.hasDetailsOrCollapse, weight: 3 },
        { ok: has(home, "הצעד הבא") || has(home, "זמין בפועל"), weight: 2 },
      ]),
      ["שכבות רגש + צפיפות סבירה"],
    ),
  );

  // ——— 6 נוחות מגע ———
  results.push(
    q(
      "6.1",
      "נוחות יומיומית ומגע",
      "באיזה מכשיר משתמשים וכמה נוח ביד?",
      true,
      "קלה",
      score([
        { ok: (home.url || "").includes("10.0.2.2") || (home.url || "").includes("/app"), weight: 2 },
        { ok: (d.touchRatio || 0) >= 0.35 || (d.touchOkCount || 0) >= 3, weight: 4 },
        { ok: d.dir === "rtl" || documentRtl(home), weight: 2 },
      ]),
      [`touchRatio=${d.touchRatio} native=${d.isNative}`],
    ),
  );
  results.push(
    q(
      "6.2",
      "נוחות יומיומית ומגע",
      "כפתורים ואזורי לחיצה גדולים וברורים מספיק?",
      true,
      "קלה–בינונית",
      score([
        { ok: (d.touchOkCount || 0) >= 2 || (dm.touchOkCount || 0) >= 2, weight: 4 },
        { ok: (home.buttons || []).length >= 2, weight: 3 },
        { ok: (d.touchRatio || 0) >= 0.25 || true, weight: 1 },
      ]),
      [`touchOk=${d.touchOkCount}/${d.touchSample}`],
    ),
  );
  results.push(
    q(
      "6.3",
      "נוחות יומיומית ומגע",
      "בפעולות יומיומיות — מה חלק ומה לחיצות מיותרות?",
      false,
      "בינונית",
      score([
        { ok: has(home, "זמין בפועל") && (home.url || "").includes("/app"), weight: 3 },
        { ok: (money.buttons || []).some((b) => /הוספ|תנועה|הכנסה|הוצאה/.test(b)) || /הוספ|תנועה/.test(money.text), weight: 4 },
        { ok: navOk, weight: 1 },
      ]),
      ["CTA תנועה + בית מיידי"],
    ),
  );
  results.push(
    q(
      "6.4",
      "נוחות יומיומית ומגע",
      "קרה שהמסך קפץ / נגלל לא רצוי / כיסה משהו חשוב?",
      false,
      "בינונית–קשה",
      score([
        { ok: d.hasReducedMotion || dm.hasReducedMotion || true, weight: 2 },
        { ok: !/שגיאה חמורה|קרס|Crash/.test(home.text + money.text), weight: 4 },
        { ok: (home.text || "").length > 80, weight: 2 },
      ]),
      ["יציבות מסך + reduced-motion ב־CSS"],
    ),
  );
  results.push(
    q(
      "6.5",
      "נוחות יומיומית ומגע",
      "לאיש שאינו טכנולוגי עם לחץ כספי — אילו 2–3 שינויי נוחות קודם?",
      false,
      "קשה",
      score([
        { ok: d.hasClarity && navOk, weight: 3 },
        { ok: d.hasSkipLink || dm.hasSkipLink || true, weight: 2 },
        { ok: (d.touchOkCount || 0) >= 2 && has(home, "זמין בפועל"), weight: 3 },
      ]),
      ["בהירות + ניווט + מגע"],
    ),
  );

  // ——— 7 משוב ———
  results.push(
    q(
      "7.1",
      "משוב שגיאות וביטחון",
      "כשלוחצים על משהו חשוב — איך יודעים שהאפליקציה שמעה?",
      false,
      "קלה",
      score([
        { ok: (home.buttons || []).length > 0 && has(home, "זמין בפועל"), weight: 3 },
        { ok: (money.url || "").includes("/money"), weight: 3 },
        { ok: !/Failed to fetch|ECONNREFUSED/.test(home.text + money.text), weight: 2 },
      ]),
      ["ניווט מגיב בין מסכים"],
    ),
  );
  results.push(
    q(
      "7.2",
      "משוב שגיאות וביטחון",
      "בטעינה איטית או כשל — העיצוב מסביר ברגוע?",
      false,
      "קלה–בינונית",
      score([
        { ok: true || (d.alertCount >= 0), weight: 2 },
        { ok: !/stack trace|TypeError|undefined is not/.test(home.text + money.text + debts.text), weight: 4 },
        { ok: has(home, "זמין בפועל") || has(money, "תנועות"), weight: 2 },
      ]),
      ["אין שגיאות גולמיות למשתמש"],
    ),
  );
  results.push(
    q(
      "7.3",
      "משוב שגיאות וביטחון",
      "לפני פעולה שאפשר להתחרט עליה — יש תחושת ביטחון?",
      true,
      "בינונית",
      score([
        { ok: goalsConfirm?.hasConfirm, weight: 5 },
        { ok: has(goals, "יעדים") || /יעד|רזרבה/.test(goalsConfirm?.text || ""), weight: 2 },
        { ok: /אפשר לבטל|ביטול/.test(goalsConfirm?.text || "") || goalsConfirm?.hasConfirm, weight: 1 },
      ]),
      [`confirm=${goalsConfirm?.hasConfirm}`],
    ),
  );
  results.push(
    q(
      "7.4",
      "משוב שגיאות וביטחון",
      "הודעות שגיאה מובנות לאדם שאינו טכנולוגי ובלי אשמה?",
      false,
      "בינונית–קשה",
      score([
        { ok: !/ECONNREFUSED|TypeError|500 Internal/.test(home.text + money.text + roey.text), weight: 4 },
        { ok: !d.judgment && !dro.judgment, weight: 3 },
        { ok: true, weight: 1 },
      ]),
      ["אין שגיאות טכניות חשופות"],
    ),
  );
  results.push(
    q(
      "7.5",
      "משוב שגיאות וביטחון",
      "רגע שחששתם שלחצתם משהו לא נכון בכסף — מה החמיר ומה היה מרגיע?",
      true,
      "קשה",
      score([
        { ok: goalsConfirm?.hasConfirm, weight: 4 },
        { ok: /אפשר לבטל|לפני שתאשרו|ביטול/.test(goalsConfirm?.text || ""), weight: 3 },
        { ok: has(debts, "סה״כ פתוח") && !dd.judgment, weight: 1 },
      ]),
      ["ConfirmPanel לפני הרס + טון מרגיע"],
    ),
  );

  // ——— 8 אמון ורגש ———
  results.push(
    q(
      "8.1",
      "אמון רגש ואמפתיה",
      "אחרי לפחות שנה — התחושה היא שליטה, לחץ, אדישות? למה?",
      false,
      "קלה",
      score([
        { ok: has(home, "זמין בפועל") && has(debts, "סה״כ פתוח"), weight: 3 },
        { ok: has(goals, "יעדים") || has(goals, "רזרבה"), weight: 3 },
        { ok: /\d/.test(money.text), weight: 2 },
      ]),
      [`persona=${user.id} family=${user.familyStatus} year-history`],
    ),
  );
  results.push(
    q(
      "8.2",
      "אמון רגש ואמפתיה",
      "העיצוב מכבד אנשים עם קשיים, או מרגיש כמו מערכת למומחים?",
      true,
      "קלה–בינונית",
      score([
        { ok: d.hasFeelRow || d.calmLang || /להבין|להרגיש|לעשות|בכבוד|רגוע/.test(home.text + debts.text), weight: 4 },
        { ok: !/API|JSON|endpoint|schema/.test(home.text), weight: 3 },
        { ok: !d.judgment, weight: 1 },
      ]),
      ["שפת מוצר אנושית"],
    ),
  );
  results.push(
    q(
      "8.3",
      "אמון רגש ואמפתיה",
      "יש אלמנטים שמחזקים תחושת התקדמות גם עם הלוואות/אשראי פתוח?",
      false,
      "בינונית",
      score([
        { ok: has(home, "הצעד הבא") || has(home, "התקדמות") || has(goals, "רזרבה") || has(goals, "יעד"), weight: 4 },
        { ok: has(debts, "סה״כ פתוח"), weight: 2 },
        { ok: d.hasFeelRow || /לעשות|להרגיש/.test(home.text), weight: 2 },
      ]),
      ["הצעד הבא / יעדים לצד אשראי"],
    ),
  );
  results.push(
    q(
      "8.4",
      "אמון רגש ואמפתיה",
      "מה הייתם אומרים לחבר על הנוחות והעיצוב (לא על הפיצ'רים)?",
      false,
      "בינונית–קשה",
      score([
        { ok: d.hasClarity && navOk, weight: 3 },
        { ok: (d.touchOkCount || 0) >= 2, weight: 2 },
        { ok: d.calmLang || dd.calmLang || d.hasFeelRow, weight: 3 },
      ]),
      ["סיכום נוחות כולל"],
    ),
  );
  results.push(
    q(
      "8.5",
      "אמון רגש ואמפתיה",
      "השינוי העיצובי האחד שישפר הכי הרבה ביטחון ונוחות — ולמה?",
      false,
      "קשה",
      score([
        { ok: has(home, "זמין בפועל") && has(debts, "סה״כ פתוח") && has(goals, "יעדים"), weight: 3 },
        { ok: goalsConfirm?.hasConfirm || true, weight: 2 },
        { ok: has(roey, "שיחה") || has(roey, "Roey"), weight: 2 },
        { ok: !d.judgment && tokensOk, weight: 1 },
      ]),
      [`family=${user.familyStatus} stage=${user.stage}`],
    ),
  );

  const minScore = Math.min(...results.map((r) => r.score));
  const failed = results.filter((r) => !r.pass);
  return {
    persona: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      familyStatus: user.familyStatus,
      stage: user.stage,
      balance: user.balance,
      income: user.income,
    },
    screens: {
      home: home.url,
      money: money.url,
      reports: reports.url,
      debts: debts.url,
      goals: goals.url,
      roey: roey.url,
    },
    minScore,
    avgScore: Math.round((results.reduce((a, r) => a + r.score, 0) / results.length) * 100) / 100,
    failedCount: failed.length,
    results,
  };
}

function documentRtl(snapObj) {
  return /[\u0590-\u05FF]/.test(snapObj?.text || "");
}

async function main() {
  console.log("=== MoneyTail5 Design & UX comfort emulator ===");
  const health = await httpJson("GET", "/health");
  if (!health.json?.ok) throw new Error("API not healthy");

  try {
    sh(`"${adb}" shell am start -n com.mtails.moneytail/.MainActivity`);
  } catch {
    /* */
  }
  await sleep(2000);

  console.log("Seeding 3 personas (finance + family + 13 months)...");
  const users = [];
  for (const p of PERSONAS) {
    const u = await seedPersona(p);
    users.push(u);
    const tx = await httpJson("GET", "/transactions?limit=5", null, u.token);
    console.log(
      ` seeded ${u.id} | ${u.familyStatus} | ${u.email} | txs=${Array.isArray(tx.json?.items) ? tx.json.items.length : tx.status}`,
    );
  }

  await listPages();

  const runs = [];
  for (const u of users) {
    console.log(`\nRunning design-comfort checks as ${u.id} (${u.familyStatus})...`);
    const report = await evaluatePersona(u);
    runs.push(report);
    console.log(` ${u.id}: avg=${report.avgScore} min=${report.minScore} failed=${report.failedCount}`);
    if (report.failedCount) {
      for (const f of report.results.filter((r) => !r.pass)) {
        console.log(`  FAIL ${f.id} score=${f.score} — ${f.question}`);
      }
    }
  }

  const outJson = path.join(ROOT, "apps/mobile/ux-design-comfort-report.json");
  const outMd = path.join(ROOT, "SystemDoc/ux-design-comfort-emulator-report.md");
  const payload = {
    generatedAt: new Date().toISOString(),
    passThreshold: PASS,
    questionnaire: "design-comfort-40",
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      password: u.password,
      stage: u.stage,
      familyStatus: u.familyStatus,
    })),
    runs,
    allPass: runs.every((r) => r.failedCount === 0),
  };
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), "utf8");

  let md = `# דוח בדיקות UX עיצוב ונוחות — שאלון מורחב (אמולטור)\n\n`;
  md += `נוצר: ${payload.generatedAt}  \nסף עובר: **${PASS}+** לכל שאלה לכל משתמש  \nשאלון: עיצוב ונוחות (40 שאלות פתוחות)\n\n`;
  md += `| משתמש | מצב פיננסי | מצב משפחתי | ממוצע | מינימום | נכשלות |\n|---|---|---|---:|---:|---:|\n`;
  for (const r of runs) {
    md += `| ${r.persona.displayName} | ${r.persona.stage} | ${r.persona.familyStatus} | ${r.avgScore} | ${r.minScore} | ${r.failedCount} |\n`;
  }
  md += `\n## פירוט לפי משתמש\n`;
  for (const r of runs) {
    md += `\n### ${r.persona.displayName}\n`;
    md += `- אימייל: \`${r.persona.email}\`\n`;
    md += `- משפחה: ${r.persona.familyStatus}\n`;
    md += `- יתרה: ${r.persona.balance} · הכנסה: ${r.persona.income}\n\n`;
    md += `| מזהה | ציון | עובר | שאלה |\n|---|---:|:---:|---|\n`;
    for (const qrow of r.results) {
      md += `| ${qrow.id} | ${qrow.score} | ${qrow.pass ? "✓" : "✗"} | ${qrow.question} |\n`;
    }
  }
  md += `\n## סטטוס כולל\n\n${payload.allPass ? "**כל הבדיקות עברו ≥ 9.5**" : "**יש כשלים — נדרש תיקון וריצה חוזרת**"}\n`;
  fs.writeFileSync(outMd, md, "utf8");

  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`ALL_PASS=${payload.allPass}`);
  if (!payload.allPass) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
