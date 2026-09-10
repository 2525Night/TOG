/**
 * UX questionnaire — מעקב מזומן (Pocket Journal) as a real user on Android emulator.
 * Threshold: every question score >= 9.5
 *
 *   node scripts/ux-cash-questionnaire-emulator.mjs
 *
 * No screenshots (hang-prone). Uses WebView CDP + DOM evidence.
 */
import WebSocket from "ws";
import http from "http";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = "http://127.0.0.1:3001/api";
const WEB = "http://10.0.2.2:3005";
const PASS = 9.5;
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Set a React-controlled input value via CDP (clears value tracker). */
const SET_INPUT = `(sel, val) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const proto = window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = desc && desc.set;
  const tracker = el._valueTracker;
  if (tracker) tracker.setValue('');
  if (setter) setter.call(el, val);
  else el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value === String(val);
}`;

async function api(method, pathName, body, tok) {
  const r = await fetch(API + pathName, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  return { status: r.status, j };
}

async function connectCdp() {
  const pid = sh(`"${adb}" shell pidof -s com.mtails.moneytail`);
  if (!pid) throw new Error("app not running");
  try {
    sh(`"${adb}" forward --remove tcp:9222`);
  } catch {
    /* */
  }
  sh(`"${adb}" forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  try {
    sh(`"${adb}" reverse tcp:3001 tcp:3001`);
    sh(`"${adb}" reverse tcp:3005 tcp:3005`);
  } catch {
    /* */
  }
  const list = await new Promise((resolve, reject) => {
    http
      .get("http://127.0.0.1:9222/json/list", (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(JSON.parse(b)));
      })
      .on("error", reject);
  });
  const page = list.find((t) => t.type === "page") || list[0];
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
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const result = await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
        });
        if (result.exceptionDetails) {
          const msg =
            result.exceptionDetails.text ||
            result.exceptionDetails.exception?.description ||
            "eval fail";
          if (/Inspected|context|destroyed|Cannot find|Uncaught/i.test(msg)) {
            await sleep(700);
            continue;
          }
          throw new Error(msg);
        }
        return result.result?.value;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/Inspected|context|destroyed|Cannot find|Uncaught/i.test(msg) && attempt < 7) {
          await sleep(700);
          continue;
        }
        throw e;
      }
    }
    throw new Error("evaluate retries exhausted");
  }
  async function goto(url) {
    await send("Page.enable").catch(() => null);
    await send("Page.navigate", { url }).catch(async () => {
      await evaluate(`location.href = ${JSON.stringify(url)}`);
    });
    await sleep(1800);
  }
  await send("Runtime.enable").catch(() => null);
  await send("Page.enable").catch(() => null);
  return { evaluate, goto, close: () => ws.close() };
}

async function waitFor(evaluate, expression, check, timeoutMs = 30000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await evaluate(expression);
    if (check(last)) return last;
    await sleep(600);
  }
  throw new Error(`timeout — ${JSON.stringify(last)?.slice(0, 500)}`);
}

function q(id, category, question, score, evidence, gaps = []) {
  return {
    id,
    category,
    question,
    score,
    pass: score >= PASS,
    evidence,
    gaps,
  };
}

function scoreFrom(checks) {
  // checks: [{ok, weight?, gap?}]
  const totalW = checks.reduce((s, c) => s + (c.weight ?? 1), 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight ?? 1 : 0), 0);
  const ratio = totalW ? got / totalW : 0;
  // Map to 7.0–10.0 band so partial still shows gaps clearly
  return Math.round((7 + ratio * 3) * 10) / 10;
}

console.log("=== UX cash questionnaire (emulator) ===\n");

const stamp = Date.now();
const email = `ux_cash_${stamp}@test.local`;
const password = "Password123!";
const reg = await api("POST", "/auth/register", {
  email,
  password,
  displayName: "משתמש מזומן",
});
const tok = reg.j?.accessToken;
if (!tok) throw new Error("register failed");

await api(
  "POST",
  "/auth/onboarding/complete",
  {
    accountName: "עו״ש",
    monthlyIncomeNet: 14000,
    creditCards: [{ name: "מקס", currentBalance: 400, creditLimit: 10000 }],
    fixedExpenses: [{ label: "שכירות", categoryKey: "housing", amount: 4500 }],
    goalTitle: "רזרבה",
    goalTargetAmount: 3000,
    goalCurrentAmount: 0,
  },
  tok,
);

const month = new Date().toISOString().slice(0, 7);
const bookedAt = `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;

sh(`"${adb}" shell am force-stop com.mtails.moneytail`);
await sleep(700);
sh(
  `"${adb}" shell am start -n com.mtails.moneytail/com.mtails.moneytail.MainActivity`,
);
await sleep(2200);

const cdp = await connectCdp();
await cdp.evaluate(`localStorage.setItem('mt_token', ${JSON.stringify(tok)});`);

const results = [];

// --- EMPTY STATE TOUR ---
await cdp.goto(`${WEB}/app/cash?month=${month}`);
const emptyUi = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    const byTest = (id) => !!document.querySelector('[data-testid=\"'+id+'\"]');
    return {
      url: location.href,
      hasClarity: byTest('cash-clarity') || t.includes('מזומן בכיס'),
      hasNotChecking: byTest('cash-not-checking') || t.includes('לא יתרת עו״ש') || t.includes('לא עו״ש'),
      hasEmpty: byTest('cash-empty') || t.includes('עדיין אין יומן מזומן'),
      hasOpeningCta: byTest('cash-cta-opening') || t.includes('יתרת פתיחה'),
      hasAtmCta: byTest('cash-cta-atm') || t.includes('משיכה מעו״ש'),
      hasFeel: t.includes('להבין') && t.includes('להרגיש') && t.includes('לעשות'),
      hasPulse: t.includes('יומן כיס'),
      hasNav: t.includes('מעקב מזומן'),
      text: t.replace(/\\s+/g,' ').slice(0,350),
    };
  })()`,
  (v) => v && (v.hasEmpty || v.hasClarity),
);

results.push(
  q(
    "E1",
    "כניסה ובהירות",
    "כשנכנסים לדף המזומן — ברור מיד שזה כיס ולא עו״ש?",
    scoreFrom([
      { ok: emptyUi.hasClarity },
      { ok: emptyUi.hasNotChecking, weight: 1.2 },
      { ok: emptyUi.hasNav },
    ]),
    ["clarity hero", "לא עו״ש", emptyUi.text],
    emptyUi.hasNotChecking ? [] : ["חסר סימון מפורש לא-עו״ש"],
  ),
);

results.push(
  q(
    "E2",
    "מצב ריק",
    "במצב ריק — ברור מה הצעד הראשון?",
    scoreFrom([
      { ok: emptyUi.hasEmpty },
      { ok: emptyUi.hasOpeningCta, weight: 1.2 },
      { ok: emptyUi.hasAtmCta },
    ]),
    ["empty CTAs", emptyUi.hasOpeningCta, emptyUi.hasAtmCta],
    emptyUi.hasOpeningCta ? [] : ["חסר CTA יתרת פתיחה"],
  ),
);

results.push(
  q(
    "E3",
    "רגש ומסע",
    "יש שכבת רגש/ליווי (Pulse + FeelRow) בלי שיפוט?",
    scoreFrom([{ ok: emptyUi.hasPulse }, { ok: emptyUi.hasFeel, weight: 1.3 }]),
    ["Pulse", "FeelRow להבין/להרגיש/לעשות"],
    emptyUi.hasFeel ? [] : ["חסר FeelRow"],
  ),
);

// Opening flow
await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-cta-opening\"]');
  if (b) b.click();
  return !!b;
})()`);
await sleep(800);
const openingForm = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    return {
      open: !!document.querySelector('[data-testid=\"cash-form-opening\"]') || t.includes('יתרת פתיחה'),
      hasAmount: !!document.querySelector('[data-testid=\"cash-amount\"]'),
      askHowMuch: t.includes('כמה יש') || t.includes('נקודת ההתחלה'),
    };
  })()`,
  (v) => v && v.open,
);

await cdp.evaluate(`(() => {
  const setInput = ${SET_INPUT};
  if (!setInput('[data-testid="cash-amount"]', '420')) return false;
  const btn = document.querySelector('[data-testid="cash-save-opening"]');
  if (btn) btn.click();
  return true;
})()`);

const afterOpen = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    const hero = document.querySelector('[data-testid=\"cash-balance-hero\"]');
    return {
      balanceText: hero?.textContent || '',
      has420: (hero?.textContent || '').includes('420') || t.includes('₪420') || t.includes('420'),
      hasJournal: !!document.querySelector('[data-testid=\"cash-journal-list\"]'),
      hasStatus: !!document.querySelector('[data-testid=\"cash-status\"]') || t.includes('יומן התחיל'),
      hasChips: !!document.querySelector('[data-testid=\"cash-chips\"]'),
      hasWin: t.includes('בכיס') && t.includes('רשומות'),
      hasAdd: !!document.querySelector('[data-testid=\"cash-cta-add\"]'),
      err: document.querySelector('[data-testid=\"cash-error\"]')?.textContent || null,
    };
  })()`,
  (v) => v && v.has420 && v.hasJournal,
  35000,
);

results.push(
  q(
    "F1",
    "יתרת פתיחה",
    "טופס יתרת פתיחה ברור ומוביל לשמירה בלי בלבול?",
    scoreFrom([
      { ok: openingForm.open },
      { ok: openingForm.hasAmount },
      { ok: openingForm.askHowMuch },
      { ok: afterOpen.has420, weight: 1.3 },
      { ok: afterOpen.hasStatus },
    ]),
    ["opening form", afterOpen.balanceText, afterOpen.hasStatus],
  ),
);

results.push(
  q(
    "J1",
    "יומן ורשימה",
    "אחרי פתיחה — היומן, הסינון והיתרה מרגישים כמו מסך עבודה ברור?",
    scoreFrom([
      { ok: afterOpen.hasJournal },
      { ok: afterOpen.hasChips, weight: 1.2 },
      { ok: afterOpen.hasAdd },
      { ok: afterOpen.hasWin },
    ]),
    ["journal", "chips", "WinStrip", "add CTA"],
    afterOpen.hasChips ? [] : ["חסרים chips"],
  ),
);

// Add expense flow
await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-cta-add\"]');
  if (b) b.click();
  return !!b;
})()`);
await sleep(600);
await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-choice-expense\"]');
  if (b) b.click();
  return !!b;
})()`);
const expenseForm = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    return {
      open: !!document.querySelector('[data-testid=\"cash-form-expense\"]'),
      explain: t.includes('יורד מהכיס') || t.includes('העו״ש לא משתנה'),
      hasCat: !!document.querySelector('[data-testid=\"cash-category\"]'),
    };
  })()`,
  (v) => v && v.open,
);

await cdp.evaluate(`(() => {
  const setInput = ${SET_INPUT};
  setInput('[data-testid="cash-amount"]', '35');
  setInput('[data-testid="cash-description"]', 'קפה UX');
  const cat = document.querySelector('[data-testid="cash-category"]');
  if (cat) {
    cat.value = 'food';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const btn = document.querySelector('[data-testid="cash-save-expense"]');
  if (btn) btn.click();
  return true;
})()`);

const afterExpense = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    const hero = document.querySelector('[data-testid=\"cash-balance-hero\"]');
    return {
      hasCoffee: t.includes('קפה'),
      bal: hero?.textContent || '',
      has385: (hero?.textContent || '').includes('385') || t.includes('₪385') || t.includes('385'),
      todayHint: t.includes('היום') && (t.includes('35') || t.includes('−')),
      status: !!document.querySelector('[data-testid=\"cash-status\"]') || t.includes('נשמר ביומן'),
    };
  })()`,
  (v) => v && v.hasCoffee && v.has385,
  35000,
);

results.push(
  q(
    "F2",
    "תיעוד הוצאה",
    "תיעוד הוצאה מהכיס ברור, מהיר, ומעדכן יתרה?",
    scoreFrom([
      { ok: expenseForm.open },
      { ok: expenseForm.explain, weight: 1.2 },
      { ok: expenseForm.hasCat },
      { ok: afterExpense.hasCoffee },
      { ok: afterExpense.has385, weight: 1.3 },
      { ok: afterExpense.status },
    ]),
    ["expense form", afterExpense.bal, afterExpense.hasCoffee],
  ),
);

// Detail row
await cdp.evaluate(`(() => {
  const rows = [...document.querySelectorAll('[data-testid^=\"cash-row-\"]')];
  const coffee = rows.find(r => (r.textContent||'').includes('קפה')) || rows[0];
  if (coffee) coffee.click();
  return !!coffee;
})()`);
const detailUi = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    return {
      open: !!document.querySelector('[data-testid=\"cash-detail\"]'),
      hasAmount: !!document.querySelector('[data-testid=\"cash-detail-amount\"]'),
      hasDelete: !!document.querySelector('[data-testid=\"cash-detail-delete\"]'),
      hasClose: !!document.querySelector('[data-testid=\"cash-detail-close\"]'),
    };
  })()`,
  (v) => v && v.open,
);

results.push(
  q(
    "D1",
    "פרטי שורה",
    "לחיצה על שורה פותחת פרטים ברורים עם מחיקה/סגירה?",
    scoreFrom([
      { ok: detailUi.open },
      { ok: detailUi.hasAmount },
      { ok: detailUi.hasDelete },
      { ok: detailUi.hasClose },
    ]),
    ["detail panel"],
  ),
);

await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-detail-close\"]');
  if (b) b.click();
  return true;
})()`);
await sleep(400);

// ATM form explain
await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-cta-add\"]');
  if (b) b.click();
  return !!b;
})()`);
await sleep(500);
await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-choice-atm\"]');
  if (b) b.click();
  return !!b;
})()`);
const atmForm = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    return {
      open: !!document.querySelector('[data-testid=\"cash-form-atm\"]'),
      explain: !!document.querySelector('[data-testid=\"cash-atm-explain\"]') ||
        (t.includes('עו״ש') && t.includes('מזומן')),
    };
  })()`,
  (v) => v && v.open,
);

results.push(
  q(
    "F3",
    "משיכה לכיס",
    "משיכה מעו״ש מוסברת כשתי תנועות מקושרות בלי כפילות מבלבלת?",
    scoreFrom([{ ok: atmForm.open }, { ok: atmForm.explain, weight: 1.4 }]),
    ["ATM explain"],
    atmForm.explain ? [] : ["חסר הסבר dual-write"],
  ),
);

// Home integration
await cdp.goto(`${WEB}/app?month=${month}`);
const homeUi = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    const link = [...document.querySelectorAll('a')].find(a =>
      (a.textContent||'').includes('מזומן בכיס') || (a.getAttribute('href')||'').includes('/app/cash')
    );
    return {
      hasRow: t.includes('מזומן בכיס'),
      href: link?.getAttribute('href') || null,
    };
  })()`,
  (v) => v && v.hasRow,
);

results.push(
  q(
    "I1",
    "שילוב בבית",
    "בתמונת מצב מופיעה שורת מזומן בכיס עם מעבר ליומן?",
    scoreFrom([{ ok: homeUi.hasRow, weight: 1.5 }, { ok: !!homeUi.href }]),
    [homeUi.href],
  ),
);

// Money integration
await cdp.goto(`${WEB}/app/money?month=${month}`);
// seed ATM if missing
await api(
  "POST",
  "/transactions/cash-atm-withdrawal",
  {
    amount: 50,
    bookedAt,
    description: "משיכת מזומן · כספומט",
  },
  tok,
);
await cdp.goto(`${WEB}/app/money?month=${month}`);
const moneyUi = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    return {
      hasLink: t.includes('יומן כיס') || t.includes('מזומן ·'),
      hasAtm: t.includes('משיכת מזומן') || t.includes('כספומט'),
      hasNav: t.includes('מעקב מזומן'),
    };
  })()`,
  (v) => v && (v.hasLink || v.hasAtm),
);

results.push(
  q(
    "I2",
    "שילוב בתנועות",
    "מתנועות רואים משיכת מזומן וקישור חזרה ליומן כיס?",
    scoreFrom([
      { ok: moneyUi.hasAtm },
      { ok: moneyUi.hasLink, weight: 1.3 },
      { ok: moneyUi.hasNav },
    ]),
    [moneyUi],
  ),
);

// Filter chip interaction back on cash
await cdp.goto(`${WEB}/app/cash?month=${month}`);
await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    const chips = document.querySelector('[data-testid=\"cash-chips\"]');
    const loading = document.querySelector('[data-testid=\"cash-loading\"]');
    return {
      ready: !!chips && !loading && (t.includes('משיכות לכיס') || t.includes('משיכות')),
      hasOut: !!document.querySelector('[data-testid=\"cash-chip-out\"]'),
    };
  })()`,
  (v) => v && v.ready && v.hasOut,
  40000,
);
await cdp.evaluate(`(() => {
  const b = document.querySelector('[data-testid=\"cash-chip-out\"]');
  if (b) b.click();
  return !!b;
})()`);
const filterUi = await waitFor(
  cdp.evaluate,
  `(() => {
    const t = document.body?.innerText || '';
    const chip = document.querySelector('[data-testid=\"cash-chip-out\"]');
    const status = document.querySelector('[data-testid=\"cash-filter-status\"]');
    const pressed =
      chip?.getAttribute('aria-pressed') === 'true' ||
      chip?.getAttribute('aria-selected') === 'true' ||
      chip?.getAttribute('data-active') === 'true' ||
      chip?.classList?.contains('active');
    return {
      pressed: !!pressed,
      stillHasExpense: t.includes('קפה') || t.includes('הוצא'),
      labelPocket: t.includes('משיכות לכיס') || t.includes('משיכות'),
      statusOut:
        (status?.textContent || '').includes('הוצאות') ||
        t.includes('מציגים: הוצאות'),
    };
  })()`,
  (v) => v && v.pressed && v.labelPocket,
  15000,
);

results.push(
  q(
    "J2",
    "סינון",
    "Chips סינון מובנים (כולל משיכות לכיס) ועובדים?",
    scoreFrom([
      { ok: filterUi.pressed, weight: 1.2 },
      { ok: filterUi.labelPocket, weight: 1.2 },
      { ok: filterUi.stillHasExpense || filterUi.statusOut },
    ]),
    [filterUi],
    filterUi.pressed ? [] : ["chip לא נלחץ / aria-pressed"],
  ),
);

cdp.close();

const minScore = Math.min(...results.map((r) => r.score));
const avgScore =
  Math.round(
    (results.reduce((s, r) => s + r.score, 0) / results.length) * 10,
  ) / 10;
const failed = results.filter((r) => !r.pass);

console.log("\n--- Results ---");
for (const r of results) {
  console.log(
    `${r.pass ? "PASS" : "FAIL"} ${r.id} ${r.score} · ${r.category} · ${r.question}`,
  );
  if (r.gaps?.length) console.log(`      gaps: ${r.gaps.join("; ")}`);
}
console.log(`\nmin=${minScore} avg=${avgScore} failed=${failed.length}`);

const outJson = path.join(ROOT, "apps/mobile/ux-cash-questionnaire-report.json");
const outMd = path.join(ROOT, "SystemDoc/ux-cash-questionnaire-emulator-report.md");
const payload = {
  generatedAt: new Date().toISOString(),
  passThreshold: PASS,
  email,
  minScore,
  avgScore,
  allPass: failed.length === 0 && minScore >= PASS,
  results,
};
fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), "utf8");
let md = `# UX · מעקב מזומן (אימולטור)\n\n`;
md += `נוצר: ${payload.generatedAt}  \nסף: **${PASS}+**  \nmin=${minScore} · avg=${avgScore} · ALL_PASS=${payload.allPass}\n\n`;
md += `| id | ציון | | שאלה |\n|----|------|---|------|\n`;
for (const r of results) {
  md += `| ${r.id} | ${r.score} | ${r.pass ? "✓" : "✗"} | ${r.question} |\n`;
}
fs.writeFileSync(outMd, md, "utf8");
console.log(`\nWrote ${outJson}`);
console.log(`Wrote ${outMd}`);
console.log(`ALL_PASS=${payload.allPass}`);
process.exit(payload.allPass ? 0 : 1);
