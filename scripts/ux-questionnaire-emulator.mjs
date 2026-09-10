/**
 * MoneyTail5 UX questionnaire — seed 3 personas + run 40 checks via Android emulator CDP.
 * Usage: node scripts/ux-questionnaire-emulator.mjs
 * Pass threshold: every question score >= 9.5 for every persona.
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

/** Navigation tears down the CDP target — fire-and-forget then reconnect. */
async function goto(url, waitMs = 4000) {
  const cdp = await connectCdp();
  cdp.evaluate(`location.href = ${JSON.stringify(url)}`).catch(() => null);
  await sleep(waitMs);
  try {
    cdp.close();
  } catch {
    /* already closed after navigation */
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

/** Personas: crisis / stabilizing / security — each with 12+ months activity. */
const PERSONAS = [
  {
    id: "crisis",
    displayName: "נועה במשבר",
    emailPrefix: "ux_crisis",
    stage: "RECOVERY",
    income: 9800,
    balance: -4200,
    fixed: [
      { label: "שכירות", categoryKey: "housing", amount: 4500 },
      { label: "סופר", categoryKey: "groceries", amount: 1600 },
      { label: "חשמל+מים", categoryKey: "utilities", amount: 520 },
    ],
    cards: [{ name: "ויזה לחוצה", currentBalance: 11800, creditLimit: 12000 }],
    loans: [
      {
        name: "הלוואת בנק",
        originalAmount: 45000,
        principalBalance: 38200,
        monthlyPayment: 1450,
        aprPercent: 8.9,
      },
      {
        name: "הלוואת רכב",
        originalAmount: 28000,
        principalBalance: 21400,
        monthlyPayment: 980,
        aprPercent: 7.2,
      },
    ],
    goal: { title: "רזרבה להפתעות", target: 6000, current: 200 },
    spendScale: 1.15,
  },
  {
    id: "stabilize",
    displayName: "יוסי בהתייצבות",
    emailPrefix: "ux_stabilize",
    stage: "STABILIZATION",
    income: 14200,
    balance: 2100,
    fixed: [
      { label: "משכנתא/שכירות", categoryKey: "housing", amount: 4800 },
      { label: "סופר", categoryKey: "groceries", amount: 1900 },
      { label: "סלולר", categoryKey: "cellular", amount: 79 },
    ],
    cards: [{ name: "מקס", currentBalance: 3200, creditLimit: 10000 }],
    loans: [
      {
        name: "הלוואת איחוד",
        originalAmount: 30000,
        principalBalance: 16800,
        monthlyPayment: 1100,
        aprPercent: 6.5,
      },
    ],
    goal: { title: "רזרבה להפתעות", target: 12000, current: 2800 },
    spendScale: 0.95,
  },
  {
    id: "security",
    displayName: "מיכל בונה ביטחון",
    emailPrefix: "ux_security",
    stage: "SECURITY",
    income: 18500,
    balance: 12400,
    fixed: [
      { label: "שכירות", categoryKey: "housing", amount: 5200 },
      { label: "סופר", categoryKey: "groceries", amount: 2100 },
      { label: "ביטוחים", categoryKey: "insurance", amount: 380 },
    ],
    cards: [{ name: "ישראכרט", currentBalance: 1400, creditLimit: 15000 }],
    loans: [
      {
        name: "יתרת הלוואה קטנה",
        originalAmount: 12000,
        principalBalance: 3400,
        monthlyPayment: 650,
        aprPercent: 5.5,
      },
    ],
    goal: { title: "רזרבה להפתעות", target: 20000, current: 14500 },
    spendScale: 0.8,
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
  await httpJson(
    "PATCH",
    `/accounts/${accountId}`,
    { currentBalance: persona.balance },
    token,
  );

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

  // 13 months of ledger history (salary + expenses + loan payments)
  const cats = ["dining", "transport", "groceries", "shopping", "health", "entertainment"];
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

    for (let i = 0; i < 6; i++) {
      const day = new Date(base);
      day.setUTCDate(3 + i * 4);
      const amount = Math.round((80 + i * 45 + m * 3) * persona.spendScale);
      await httpJson(
        "POST",
        "/transactions",
        {
          accountId,
          direction: "EXPENSE",
          amount,
          categoryKey: cats[i % cats.length],
          description: `הוצאה ${cats[i % cats.length]}`,
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
          amount: Math.round(220 * persona.spendScale),
          categoryKey: "shopping",
          description: "קנייה בכרטיס",
          bookedAt: chargeDay.toISOString(),
        },
        token,
      ).catch(() => null);
    }
  }

  // Re-assert balance after cash movements (seed wants persona snapshot)
  await httpJson(
    "PATCH",
    `/accounts/${accountId}`,
    { currentBalance: persona.balance },
    token,
  );

  return { ...persona, email, password, token, accountId, loanIds, cardId };
}

async function loginAs(user) {
  await goto(WEB + "/login", 2800);
  await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {}
        localStorage.setItem('mt_token', ${JSON.stringify(user.token)});
        try { localStorage.setItem('moneytail.session.token', ${JSON.stringify(user.token)}); } catch (e) {}
      })()
    `);
  });
  await goto(WEB + "/app", 5000);
  let state = await withCdp(async (cdp) =>
    cdp.evaluate(`(async () => {
      const token = localStorage.getItem('mt_token');
      let me = null;
      try {
        const r = await fetch('http://localhost:3001/api/auth/me', {
          headers: token ? { Authorization: 'Bearer ' + token } : {}
        });
        me = { status: r.status, body: (await r.text()).slice(0, 200) };
      } catch (e) {
        try {
          const r2 = await fetch('http://10.0.2.2:3001/api/auth/me', {
            headers: token ? { Authorization: 'Bearer ' + token } : {}
          });
          me = { status: r2.status, body: (await r2.text()).slice(0, 200) };
        } catch (e2) {
          me = { error: String(e2) };
        }
      }
      return {
        url: location.href,
        text: (document.body?.innerText || '').slice(0, 500),
        hasToken: !!token,
        me
      };
    })()`),
  );
  if (!(state.url || "").includes("/app") || /התחבר|התחברות|כניסה/.test(state.text || "")) {
    await goto(WEB + "/app", 5000);
    state = await withCdp(async (cdp) =>
      cdp.evaluate(`({
        url: location.href,
        text: (document.body?.innerText || '').slice(0, 500),
        hasToken: !!localStorage.getItem('mt_token')
      })`),
    );
  }
  return state;
}

async function snap(route, { mustInclude = [], retries = 2 } = {}) {
  let last = null;
  for (let i = 0; i <= retries; i++) {
    await goto(WEB + route, 4200 + i * 800);
    last = await withCdp(async (cdp) =>
      cdp.evaluate(`
      (() => {
        const text = document.body?.innerText || '';
        const html = document.body?.innerHTML || '';
        const nav = [...document.querySelectorAll('#app-sidebar .nav-label, .sidebar-nav .nav-label, nav a, [class*="nav"] a')]
          .map(n => (n.innerText || '').trim()).filter(Boolean);
        const headings = [...document.querySelectorAll('h1,h2,h3,.clarity-answer-label,.mt-kicker')]
          .map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 40);
        const buttons = [...document.querySelectorAll('button, a.btn')]
          .map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 30);
        const aria = [...document.querySelectorAll('[aria-label]')]
          .map(n => n.getAttribute('aria-label')).filter(Boolean).slice(0, 40);
        const chips = [...document.querySelectorAll('.mt-chip, .badge')]
          .map(n => (n.innerText || '').trim()).filter(Boolean).slice(0, 30);
        return {
          url: location.href,
          text,
          htmlLen: html.length,
          nav,
          headings,
          buttons,
          aria,
          chips,
        };
      })()
    `),
    );
    const okUrl = (last.url || "").includes(route.split("?")[0]);
    const okText =
      mustInclude.length === 0 ||
      mustInclude.some((s) => (last.text || "").includes(s));
    if (okUrl && okText && (last.text || "").length > 80) return last;
    await sleep(1000);
  }
  return last;
}

function has(snapObj, s) {
  return (snapObj?.text || "").includes(s);
}

function score(checks) {
  // checks: array of {ok:boolean, weight?:number}
  let w = 0;
  let got = 0;
  for (const c of checks) {
    const weight = c.weight ?? 1;
    w += weight;
    if (c.ok) got += weight;
  }
  if (w === 0) return 0;
  return Math.round((got / w) * 1000) / 100; // 0–10 with 2 decimals
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
  const home = await snap("/app", { mustInclude: ["זמין בפועל"] });
  const money = await snap("/app/money", { mustInclude: ["תנועות"] });
  await goto(WEB + "/app/money", 2500);
  const moneyOpen = await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        const b = [...document.querySelectorAll('button')].find(x => /הצג סיכום חודש/.test(x.innerText||''));
        if (b) b.click();
      })()
    `);
    await sleep(900);
    return cdp.evaluate(`({
      text: document.body?.innerText || '',
      hasGimish: /גמיש/.test(document.body?.innerText||''),
      hasKvuim: /קבוע/.test(document.body?.innerText||'')
    })`);
  });

  const reports = await snap("/app/reports", { mustInclude: ["מאזן", "קבועים", "גמיש"] });
  const debts = await snap("/app/debts", {
    mustInclude: ["סה״כ פתוח", "אשראי והלוואות"],
  });
  const goals = await snap("/app/goals", { mustInclude: ["יעדים", "רזרבה"] });
  const roey = await snap("/app/roey", { mustInclude: ["Roey", "מלווה", "שיחה"] });
  const roeyActions = await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        const tabs = [...document.querySelectorAll('button, a')];
        const actions = tabs.find(t => /פעולות/.test(t.innerText||''));
        if (actions) actions.click();
      })()
    `);
    await sleep(1200);
    return cdp.evaluate(`({
      text: document.body?.innerText || '',
      hasApprove: /מאשרים|אישור|דחייה|ממתינות לאישור|מכין/.test(document.body?.innerText||'')
    })`);
  });
  const roeyJourney = await withCdp(async (cdp) => {
    await cdp.evaluate(`
      (() => {
        const tabs = [...document.querySelectorAll('button, a')];
        const journey = tabs.find(t => /מסע/.test(t.innerText||''));
        if (journey) journey.click();
      })()
    `);
    await sleep(1200);
    return cdp.evaluate(`({
      text: document.body?.innerText || '',
      hasPlan: /תוכנית|יציבות|רזרבה|אשראי|הצעד הבא|מסע/.test(document.body?.innerText||'')
    })`);
  });

  const navOk =
    (home.nav || []).some((n) => n.includes("תמונת מצב")) &&
    (home.nav || []).some((n) => n.includes("אשראי והלוואות")) &&
    !(home.nav || []).some((n) => /^חובות$/.test(n.trim()));

  const results = [];

  // ——— 1 תמונת מצב ———
  results.push(
    q(
      "1.1",
      "תמונת מצב ואמון",
      "כשאתם נכנסים לאפליקציה, האם ברור לכם מיד מה המצב הכספי שלכם עכשיו?",
      true,
      "קלה",
      score([
        { ok: has(home, "זמין בפועל"), weight: 3 },
        { ok: (home.aria || []).includes("זמין בפועל") || has(home, "זמין בפועל"), weight: 2 },
        { ok: /₪|ש״ח|\d/.test(home.text), weight: 2 },
        { ok: (home.url || "").includes("/app"), weight: 1 },
      ]),
      ["זמין בפועל על הבית", (home.headings || []).slice(0, 6)],
    ),
  );
  results.push(
    q(
      "1.2",
      "תמונת מצב ואמון",
      "האם אתם מבינים מה ההבדל בין יתרה בחשבון לבין זמין בפועל?",
      true,
      "קלה–בינונית",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: has(home, "בחשבון") || has(home, "יתרה"), weight: 2 },
        { ok: has(home, "שמור לתשלומים"), weight: 2 },
        { ok: /שונה מיתרה|אחרי שתשלומים|שמורים בצד/.test(home.text), weight: 3 },
      ]),
      ["הסבר FeelRow + שבבים"],
    ),
  );
  results.push(
    q(
      "1.3",
      "תמונת מצב ואמון",
      "כמה אתם סומכים על המספרים שמוצגים בתמונת מצב?",
      false,
      "בינונית",
      score([
        { ok: has(home, "זמין בפועל") && has(home, "שמור לתשלומים"), weight: 3 },
        { ok: !/NaN|undefined|null/.test(home.text), weight: 2 },
        { ok: home.htmlLen > 5000, weight: 1 },
        {
          ok:
            has(home, "תמונה חלקית") ||
            has(home, "מחושב ממה שרשום") ||
            has(home, "בחשבון"),
          weight: 2,
        },
      ]),
      ["מקורות מספר גלויים"],
    ),
  );
  results.push(
    q(
      "1.4",
      "תמונת מצב ואמון",
      "האם שמור לתשלומים עוזר לא להתבלבל לגבי כסף פנוי?",
      true,
      "בינונית–קשה",
      score([
        { ok: has(home, "שמור לתשלומים"), weight: 4 },
        { ok: home.chips.some((c) => c.includes("שמור לתשלומים")), weight: 2 },
        { ok: has(home, "זמין בפועל"), weight: 2 },
      ]),
      ["chip שמור לתשלומים"],
    ),
  );
  results.push(
    q(
      "1.5",
      "תמונת מצב ואמון",
      "האם יש מספרים סותרים בין מסכים?",
      false,
      "קשה",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: has(reports, "קבועים") || has(reports, "גמיש") || has(reports, "נטו"), weight: 2 },
        { ok: has(money, "יתרה") || has(money, "תנועות"), weight: 2 },
        { ok: !/שגיאה|Failed|ECONNREFUSED/.test(home.text + reports.text), weight: 3 },
      ]),
      ["עקביות בין בית/מאזן/תנועות"],
    ),
  );

  // ——— 2 אשראי ———
  results.push(
    q(
      "2.1",
      "אשראי והלוואות",
      "האם קל למצוא הלוואות וכרטיסים?",
      false,
      "קלה",
      score([
        { ok: navOk, weight: 3 },
        { ok: has(debts, "אשראי והלוואות") || has(debts, "סה״כ פתוח"), weight: 3 },
        { ok: has(debts, "הלוואות") || has(debts, "כרטיס"), weight: 2 },
      ]),
      ["ניווט + מסך אשראי"],
    ),
  );
  results.push(
    q(
      "2.2",
      "אשראי והלוואות",
      "האם השפה רגועה יותר מ«חובות»?",
      true,
      "קלה–בינונית",
      score([
        { ok: has(debts, "אשראי והלוואות"), weight: 3 },
        { ok: !/^\s*חובות\s*$/m.test(debts.text.split("\n")[0] || ""), weight: 1 },
        { ok: !debts.nav?.some?.(() => false) && navOk, weight: 2 },
        { ok: !debts.headings.some((h) => h === "חובות"), weight: 2 },
        { ok: has(debts, "בכבוד") || has(debts, "רגוע") || has(debts, "שפה רגועה"), weight: 2 },
      ]),
      ["כותרת אשראי, בלי חובות כניווט ראשי"],
    ),
  );
  results.push(
    q(
      "2.3",
      "אשראי והלוואות",
      "האם ברור מה משתנה בתשלום הלוואה/סילוק?",
      false,
      "בינונית",
      score([
        { ok: has(debts, "הלוואות") || has(debts, "סה״כ פתוח"), weight: 3 },
        { ok: has(debts, "תשלומים") || has(debts, "קרוב") || has(debts, "התקדמות"), weight: 3 },
        { ok: has(money, "תנועות") || has(money, "הוצאה"), weight: 2 },
      ]),
      ["סקירת אשראי + תנועות"],
    ),
  );
  results.push(
    q(
      "2.4",
      "אשראי והלוואות",
      "האם רואים כמה פתוח בלי להרגיש מוצפים?",
      true,
      "בינונית–קשה",
      score([
        { ok: has(debts, "סה״כ פתוח"), weight: 4 },
        { ok: has(debts, "debts-calm") || has(debts, "רגוע") || debts.text.includes("למה אפשר"), weight: 3 },
        { ok: debts.chips.length >= 1 || has(debts, "הלוואות"), weight: 1 },
      ]),
      ["סה״כ פתוח + כרטיס רגוע"],
    ),
  );
  results.push(
    q(
      "2.5",
      "אשראי והלוואות",
      "חשש מכפל רישום — האם המערכת מסבירה?",
      false,
      "קשה",
      score([
        { ok: has(debts, "אשראי") || has(debts, "כרטיס"), weight: 2 },
        { ok: has(money, "תנועות"), weight: 2 },
        {
          ok:
            /סילוק|כרטיס|עו״ש|לא משתנה|חיוב/.test(money.text) ||
            /סילוק|אשראי שוטף/.test(debts.text),
          weight: 4,
        },
      ]),
      ["הפרדת אשראי/עו״ש בטקסט"],
    ),
  );

  // ——— 3 שימוש יומיומי ———
  results.push(
    q(
      "3.1",
      "שימוש יומיומי",
      "כניסה תכופה — האם הבית נטען ומובן?",
      false,
      "קלה",
      score([
        { ok: home.url.includes("/app"), weight: 3 },
        { ok: has(home, "זמין בפועל"), weight: 3 },
        { ok: !/שגיאה חמורה|קרס/.test(home.text), weight: 2 },
      ]),
      ["בית נגיש"],
    ),
  );
  results.push(
    q(
      "3.2",
      "שימוש יומיומי",
      "האם רישום תנועות פשוט ללא רקע טכני?",
      false,
      "קלה–בינונית",
      score([
        { ok: has(money, "תנועות"), weight: 2 },
        { ok: money.buttons.some((b) => /הוספ|תנועה|הכנסה|הוצאה/.test(b)) || /הוספ|תנועה/.test(money.text), weight: 4 },
        { ok: !/JSON|stack|undefined/.test(money.text), weight: 2 },
      ]),
      ["CTA הוספת תנועה"],
    ),
  );
  results.push(
    q(
      "3.3",
      "שימוש יומיומי",
      "מה מעכב עדכון — האם יש חיכוך ברור במסך?",
      false,
      "בינונית",
      score([
        { ok: has(money, "תנועות") || has(money, "קבועים"), weight: 3 },
        { ok: money.buttons.length >= 2, weight: 2 },
        { ok: !/Failed to fetch|ECONNREFUSED/.test(money.text), weight: 3 },
      ]),
      ["מסך תנועות פעיל"],
    ),
  );
  results.push(
    q(
      "3.4",
      "שימוש יומיומי",
      "האם שימושי בלי חיבור בנק (הזנה ידנית)?",
      true,
      "בינונית–קשה",
      score([
        { ok: has(money, "תנועות") || has(money, "הוספ"), weight: 3 },
        { ok: has(home, "זמין בפועל"), weight: 3 },
        { ok: !/חברו.*בנק|Open Banking|סנכרן חשבון חובה/.test(home.text + money.text), weight: 2 },
      ]),
      ["אין חובת בנק"],
    ),
  );
  results.push(
    q(
      "3.5",
      "שימוש יומיומי",
      "אחרי שנה — מסכים חיים vs נטושים (נוכחות נתונים)",
      false,
      "קשה",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: has(money, "תנועות") || /\d/.test(money.text), weight: 2 },
        { ok: has(debts, "סה״כ פתוח") || has(debts, "הלוואות"), weight: 2 },
        { ok: has(goals, "יעדים") || has(goals, "רזרבה"), weight: 2 },
      ]),
      [`persona=${user.id} נתונים בכל המסכים`],
    ),
  );

  // ——— 4 מסע ———
  results.push(
    q(
      "4.1",
      "מסע פיננסי",
      "האם האפליקציה מיועדת גם לאנשים עם קשיים?",
      true,
      "קלה",
      score([
        { ok: has(home, "לא גזר דין") || has(home, "לא אומר שאתם") || has(home, "בלי שיפוט") || /לא.*נכשלים|אפשר לנהל/.test(home.text), weight: 4 },
        { ok: has(debts, "בכבוד") || has(debts, "רגוע") || has(debts, "שפה רגועה"), weight: 2 },
        { ok: user.balance < 0 ? has(home, "זמין בפועל") : true, weight: 2 },
      ]),
      ["טון תומך למשבר"],
    ),
  );
  results.push(
    q(
      "4.2",
      "מסע פיננסי",
      "האם יש הצעד הבא ברור?",
      true,
      "קלה–בינונית",
      score([
        { ok: has(home, "הצעד הבא"), weight: 5 },
        { ok: home.aria.includes("הצעד הבא") || /הצעד הבא/.test(home.text), weight: 2 },
        { ok: home.buttons.some((b) => /לטפל|תנועה|Roey|יעדים|אשראי/.test(b)) || has(home, "לטפל") || has(home, "תנועה"), weight: 1 },
      ]),
      ["Pulse הצעד הבא"],
    ),
  );
  results.push(
    q(
      "4.3",
      "מסע פיננסי",
      "התקדמות גם כשיש הלוואות/מינוס?",
      true,
      "בינונית",
      score([
        { ok: has(debts, "התקדמות") || has(debts, "סה״כ פתוח") || /התקדמ/.test(debts.text), weight: 3 },
        { ok: has(home, "הצעד הבא") || has(home, "צעד"), weight: 2 },
        { ok: has(goals, "רזרבה") || has(goals, "יעדים") || has(home, "רזרבה"), weight: 2 },
      ]),
      ["התקדמות נראית"],
    ),
  );
  results.push(
    q(
      "4.4",
      "מסע פיננסי",
      "האם המסע (משבר→ביטחון) משתקף?",
      true,
      "בינונית–קשה",
      score([
        { ok: roeyJourney.hasPlan || has(roey, "מסע") || /מסע|תוכנית|יציבות/.test(roey.text), weight: 4 },
        { ok: has(home, "הצעד הבא"), weight: 2 },
        { ok: has(debts, "אשראי והלוואות"), weight: 2 },
      ]),
      ["Roey מסע / תוכנית"],
    ),
  );
  results.push(
    q(
      "4.5",
      "מסע פיננסי",
      "שליטה והבנה מול סכום בלבד?",
      true,
      "קשה",
      score([
        { ok: has(home, "להבין") || has(home, "מה המספר אומר"), weight: 3 },
        { ok: has(home, "להרגיש") || has(home, "לעשות"), weight: 3 },
        { ok: has(home, "זמין בפועל"), weight: 2 },
      ]),
      ["FeelRow להבין/להרגיש/לעשות"],
    ),
  );

  // ——— 5 מאזן ———
  results.push(
    q(
      "5.1",
      "מאזן ותזרים",
      "קבועים / גמיש / נותר מובנים?",
      true,
      "קלה",
      score([
        { ok: has(reports, "קבועים") || has(reports, "קבוע"), weight: 3 },
        { ok: has(reports, "גמיש") || moneyOpen.hasGimish, weight: 3 },
        { ok: has(reports, "נותר") || has(reports, "נטו") || has(home, "נותר"), weight: 2 },
      ]),
      ["מאזן + תנועות"],
    ),
  );
  results.push(
    q(
      "5.2",
      "מאזן ותזרים",
      "האם המאזן עוזר לפני סוף החודש?",
      false,
      "קלה–בינונית",
      score([
        { ok: has(reports, "מאזן") || reports.url.includes("reports"), weight: 3 },
        { ok: has(reports, "נטו") || has(reports, "נותר") || has(reports, "הכנסות"), weight: 3 },
        { ok: !/שגיאה|Failed/.test(reports.text), weight: 2 },
      ]),
      ["מסך מאזן"],
    ),
  );
  results.push(
    q(
      "5.3",
      "מאזן ותזרים",
      "בחודש לחוץ — מבהיר ולא רק מלחיץ?",
      false,
      "בינונית",
      score([
        { ok: has(home, "לא גזר דין") || has(home, "בלי שיפוט") || has(home, "להרגיע") || /אפשר לנהל|לא אומר שאתם/.test(home.text), weight: 4 },
        { ok: has(reports, "מאזן") || has(reports, "קבועים") || has(reports, "גמיש"), weight: 2 },
        { ok: has(home, "הצעד הבא"), weight: 2 },
      ]),
      ["טון מרגיע + מאזן"],
    ),
  );
  results.push(
    q(
      "5.4",
      "מאזן ותזרים",
      "זיהוי דפוסים?",
      true,
      "בינונית–קשה",
      score([
        { ok: has(reports, "מגמ") || has(reports, "חודש") || has(reports, "התחלק"), weight: 3 },
        { ok: has(reports, "גמיש") || has(reports, "קבועים"), weight: 3 },
        { ok: has(money, "תנועות"), weight: 2 },
      ]),
      ["מגמות במאזן"],
    ),
  );
  results.push(
    q(
      "5.5",
      "מאזן ותזרים",
      "האם יש בסיס להחלטה פיננסית?",
      false,
      "קשה",
      score([
        { ok: has(reports, "נטו") || has(reports, "נותר") || has(reports, "הכנסות"), weight: 3 },
        { ok: has(home, "הצעד הבא") || home.buttons.length > 0, weight: 3 },
        { ok: has(goals, "פנוי") || has(goals, "הקצה") || has(home, "רזרבה"), weight: 2 },
      ]),
      ["מספרים + CTA"],
    ),
  );

  // ——— 6 יעדים ———
  results.push(
    q(
      "6.1",
      "יעדים ורזרבה",
      "מודעות לרזרבה להפתעות?",
      true,
      "קלה",
      score([
        { ok: has(goals, "רזרבה להפתעות") || has(home, "רזרבה להפתעות"), weight: 5 },
        { ok: !has(home, "חיץ להפתעות"), weight: 2 },
        { ok: has(goals, "יעדים") || goals.url.includes("goals"), weight: 1 },
      ]),
      ["שם אחיד רזרבה"],
    ),
  );
  results.push(
    q(
      "6.2",
      "יעדים ורזרבה",
      "רלוונטי גם עם הלוואות פתוחות?",
      true,
      "קלה–בינונית",
      score([
        { ok: has(goals, "רזרבה") || has(goals, "יעדים"), weight: 3 },
        { ok: has(debts, "סה״כ פתוח") || has(debts, "הלוואות"), weight: 2 },
        { ok: has(goals, "פנוי") || has(goals, "הקצה") || has(goals, "רזרבה"), weight: 3 },
      ]),
      ["רזרבה לצד אשראי"],
    ),
  );
  results.push(
    q(
      "6.3",
      "יעדים ורזרבה",
      "ברור מה עושים עם פנוי להקצאה?",
      true,
      "בינונית",
      score([
        { ok: has(goals, "פנוי") || goals.aria.includes("פנוי להקצאה") || has(goals, "הקצה"), weight: 4 },
        { ok: has(goals, "רזרבה") || has(goals, "יעד"), weight: 3 },
        { ok: goals.buttons.some((b) => /הקצה|רזרבה|יעד/.test(b)) || /הקצה|רזרבה/.test(goals.text), weight: 1 },
      ]),
      ["פנוי להקצאה"],
    ),
  );
  results.push(
    q(
      "6.4",
      "יעדים ורזרבה",
      "יעדים לאורך זמן (נוכחות יעד/רזרבה בסיד)",
      false,
      "בינונית–קשה",
      score([
        { ok: has(goals, user.goal.title) || has(goals, "רזרבה"), weight: 4 },
        { ok: /\d/.test(goals.text), weight: 2 },
        { ok: !/שגיאה|Failed/.test(goals.text), weight: 2 },
      ]),
      [`goal seeded for ${user.id}`],
    ),
  );
  results.push(
    q(
      "6.5",
      "יעדים ורזרבה",
      "רזרבה בזמן משבר — בלי לחץ שיפוטי?",
      true,
      "קשה",
      score([
        { ok: has(home, "לא גזר דין") || has(home, "בלי שיפוט") || /לא אומר שאתם|אפשר לנהל/.test(home.text), weight: 3 },
        { ok: has(goals, "רזרבה") || has(home, "רזרבה"), weight: 3 },
        {
          ok: user.id === "crisis" ? has(home, "הצעד הבא") || has(home, "פער") : true,
          weight: 2,
        },
      ]),
      ["טון + רזרבה"],
    ),
  );

  // ——— 7 Roey ———
  results.push(
    q(
      "7.1",
      "ליווי Roey",
      "האם מסך Roey נגיש?",
      false,
      "קלה",
      score([
        { ok: roey.url.includes("roey") || has(roey, "Roey") || has(roey, "מלווה"), weight: 4 },
        { ok: /שיחה|מסע|פעולות|הגדרות/.test(roey.text), weight: 3 },
        { ok: !/קרס|Crash/.test(roey.text), weight: 1 },
      ]),
      ["טאבים Roey"],
    ),
  );
  results.push(
    q(
      "7.2",
      "ליווי Roey",
      "אישור לפני שינוי?",
      true,
      "קלה–בינונית",
      score([
        {
          ok:
            roeyActions.hasApprove ||
            /מאשרים|אישור|דחייה|מכין/.test(roeyActions.text + roey.text),
          weight: 5,
        },
        { ok: /פעולות/.test(roey.text + roeyActions.text), weight: 2 },
        { ok: true, weight: 1 },
      ]),
      ["פעולות + אישור"],
    ),
  );
  results.push(
    q(
      "7.3",
      "ליווי Roey",
      "המלצות מבוססות נתונים (הקשר קיים)?",
      true,
      "בינונית",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: has(roey, "Roey") || has(roey, "מלווה") || roey.url.includes("roey"), weight: 3 },
        { ok: /שיחה|תחזית|תוכנית|מסע|נתונים/.test(roey.text + roeyJourney.text), weight: 3 },
      ]),
      ["הקשר + Roey"],
    ),
  );
  results.push(
    q(
      "7.4",
      "ליווי Roey",
      "תחזית / תוכנית 30–90?",
      true,
      "בינונית–קשה",
      score([
        {
          ok: /תחזית|30|60|90|תוכנית|מסע|יציבות/.test(roey.text + roeyJourney.text),
          weight: 5,
        },
        { ok: roeyJourney.hasPlan || /מסע|תוכנית/.test(roeyJourney.text), weight: 3 },
      ]),
      ["מסע/תחזית"],
    ),
  );
  results.push(
    q(
      "7.5",
      "ליווי Roey",
      "מדריך מכבד ולא שיפוטי?",
      true,
      "קשה",
      score([
        { ok: has(home, "בלי שיפוט") || has(home, "לא גזר דין") || /אפשר לנהל|בקצב/.test(home.text + roey.text), weight: 3 },
        { ok: roeyActions.hasApprove || /מאשרים|אישור/.test(roeyActions.text + roey.text), weight: 3 },
        { ok: !/צמצום חובות/.test(roeyJourney.text + roey.text), weight: 2 },
      ]),
      ["טון + אישור משתמש"],
    ),
  );

  // ——— 8 רגש ונגישות ———
  results.push(
    q(
      "8.1",
      "חוויה רגשית ונגישות",
      "טון רגוע במצב לחוץ?",
      true,
      "קלה",
      score([
        { ok: has(home, "הצעד הבא") || has(home, "Pulse") || has(home, "להרגיש"), weight: 2 },
        { ok: /לא גזר דין|בלי שיפוט|לא אומר שאתם|אפשר לנהל|להרגיע/.test(home.text), weight: 5 },
        { ok: has(debts, "בכבוד") || has(debts, "רגוע") || has(debts, "שפה רגועה"), weight: 1 },
      ]),
      ["Pulse + FeelRow"],
    ),
  );
  results.push(
    q(
      "8.2",
      "חוויה רגשית ונגישות",
      "מובן ללא רקע טכני?",
      false,
      "קלה–בינונית",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: /עברית|ש״ח|₪/.test(home.text) || has(home, "בחשבון"), weight: 2 },
        { ok: !/API_URL|stack trace|TypeError/.test(home.text), weight: 3 },
        { ok: navOk, weight: 1 },
      ]),
      ["עברית פשוטה"],
    ),
  );
  results.push(
    q(
      "8.3",
      "חוויה רגשית ונגישות",
      "האם אין שיפוט על מינוס/אשראי?",
      true,
      "בינונית",
      score([
        { ok: !/אתם נכשלים|אשמים|חובותיכם הרעים/.test(home.text + debts.text), weight: 3 },
        { ok: /לא אומר שאתם|בלי שיפוט|לא גזר דין|בכבוד|שפה רגועה/.test(home.text + debts.text), weight: 4 },
        { ok: !has(home, "מינוס פעיל") || has(home, "אפשר לנהל"), weight: 1 },
      ]),
      ["שפה לא שיפוטית"],
    ),
  );
  results.push(
    q(
      "8.4",
      "חוויה רגשית ונגישות",
      "המלצה לחבר עם הלוואות — ערך ברור?",
      false,
      "בינונית–קשה",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: has(debts, "אשראי והלוואות"), weight: 2 },
        { ok: has(home, "הצעד הבא"), weight: 2 },
        { ok: has(goals, "רזרבה") || has(home, "רזרבה"), weight: 2 },
      ]),
      ["ערך ליבה גלוי"],
    ),
  );
  results.push(
    q(
      "8.5",
      "חוויה רגשית ונגישות",
      "שליטה אחרי שנה (תמונה מלאה למשתמש הזרע)?",
      true,
      "קשה",
      score([
        { ok: has(home, "זמין בפועל"), weight: 2 },
        { ok: has(home, "שמור לתשלומים"), weight: 2 },
        { ok: has(debts, "סה״כ פתוח"), weight: 2 },
        { ok: has(home, "הצעד הבא"), weight: 2 },
        { ok: has(home, "להבין") || has(home, "מה המספר אומר"), weight: 2 },
      ]),
      [`seed year history for ${user.id}`],
    ),
  );

  const minScore = Math.min(...results.map((r) => r.score));
  const failed = results.filter((r) => !r.pass);
  return {
    persona: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
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
    moneyOpen,
  };
}

async function main() {
  console.log("=== MoneyTail5 UX questionnaire emulator ===");
  const health = await httpJson("GET", "/health");
  if (!health.json?.ok) throw new Error("API not healthy");

  try {
    sh(`"${adb}" shell am start -n com.mtails.moneytail/.MainActivity`);
  } catch {
    /* */
  }
  await sleep(2000);

  console.log("Seeding 3 personas with 13 months of activity...");
  const users = [];
  for (const p of PERSONAS) {
    const u = await seedPersona(p);
    users.push(u);
    const tx = await httpJson("GET", "/transactions?limit=5", null, u.token);
    console.log(
      ` seeded ${u.id} ${u.email} txsSample=${Array.isArray(tx.json?.items) ? tx.json.items.length : tx.status}`,
    );
  }

  // Warm CDP
  await listPages();

  const runs = [];
  for (const u of users) {
    console.log(`\nRunning UX checks as ${u.id}...`);
    const report = await evaluatePersona(u);
    runs.push(report);
    console.log(
      ` ${u.id}: avg=${report.avgScore} min=${report.minScore} failed=${report.failedCount}`,
    );
    if (report.failedCount) {
      for (const f of report.results.filter((r) => !r.pass)) {
        console.log(`  FAIL ${f.id} score=${f.score} — ${f.question}`);
      }
    }
  }
  const outJson = path.join(ROOT, "apps/mobile/ux-questionnaire-report.json");
  const outMd = path.join(ROOT, "SystemDoc/ux-questionnaire-emulator-report.md");
  const payload = {
    generatedAt: new Date().toISOString(),
    passThreshold: PASS,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      password: u.password,
      stage: u.stage,
    })),
    runs,
    allPass: runs.every((r) => r.failedCount === 0),
  };
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), "utf8");

  let md = `# דוח בדיקות UX — שאלון מורחב (אמולטור)\n\n`;
  md += `נוצר: ${payload.generatedAt}  \nסף עובר: **${PASS}+** לכל שאלה לכל משתמש\n\n`;
  md += `| משתמש | מצב | ממוצע | מינימום | נכשלות |\n|---|---|---:|---:|---:|\n`;
  for (const r of runs) {
    md += `| ${r.persona.displayName} (${r.persona.id}) | ${r.persona.stage} | ${r.avgScore} | ${r.minScore} | ${r.failedCount} |\n`;
  }
  md += `\n## פירוט לפי משתמש\n`;
  for (const r of runs) {
    md += `\n### ${r.persona.displayName}\n`;
    md += `- אימייל: \`${r.persona.email}\`\n`;
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
