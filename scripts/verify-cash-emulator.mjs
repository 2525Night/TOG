/**
 * Emulator verification — Pocket Journal (מעקב מזומן).
 * Uses adb + WebView CDP (no screenshots).
 *
 * Prerequisites: emulator with com.mtails.moneytail, API :3001, Web :3005
 *
 *   node scripts/verify-cash-emulator.mjs
 */
import WebSocket from "ws";
import http from "http";
import { execSync } from "child_process";

const API = "http://127.0.0.1:3001/api";
const WEB_EMU = "http://10.0.2.2:3005";
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;
const results = [];

function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(method, path, body, tok) {
  const r = await fetch(API + path, {
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
  if (!pid) throw new Error("app not running — open MoneyTail on emulator");
  try {
    sh(`"${adb}" forward --remove tcp:9222`);
  } catch {
    /* */
  }
  sh(`"${adb}" forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  const list = await new Promise((resolve, reject) => {
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
  const page = list.find((t) => t.type === "page") || list[0];
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("no WebView CDP page — is WebView debugging enabled?");
  }
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
          // Navigation tears down execution context — retry.
          if (/Inspected|context|destroyed|Cannot find/i.test(msg)) {
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

async function waitFor(evaluate, expression, check, { timeoutMs = 25000, label = "wait" } = {}) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await evaluate(expression);
    if (check(last)) return last;
    await sleep(600);
  }
  throw new Error(
    `timeout: ${label} — last=${JSON.stringify(last)?.slice(0, 400)}`,
  );
}

console.log("=== verify-cash-emulator ===\n");

const devices = sh(`"${adb}" devices`);
ok("emulator attached", /emulator-\d+\s+device/.test(devices), devices.split("\n").slice(1).join(" | "));

const health = await fetch("http://127.0.0.1:3001/api/health")
  .then((r) => r.json())
  .catch(() => null);
ok("API health", !!health);

const webOk = await fetch("http://127.0.0.1:3005")
  .then((r) => r.ok || r.status < 500)
  .catch(() => false);
ok("Web :3005", webOk);

const stamp = Date.now();
const email = `cash_emu_${stamp}@test.local`;
const password = "Password123!";
const reg = await api("POST", "/auth/register", {
  email,
  password,
  displayName: "אימולטור מזומן",
});
const tok = reg.j?.accessToken;
ok("register", !!tok, email);

if (tok) {
  const onb = await api(
    "POST",
    "/auth/onboarding/complete",
    {
      accountName: "עו״ש",
      monthlyIncomeNet: 14000,
      creditCards: [
        { name: "מקס", currentBalance: 500, creditLimit: 10000 },
      ],
      fixedExpenses: [{ label: "שכירות", categoryKey: "housing", amount: 4500 }],
      goalTitle: "רזרבה",
      goalTargetAmount: 3000,
      goalCurrentAmount: 0,
    },
    tok,
  );
  ok("onboarding", onb.status < 300, String(onb.status));

  const cash = await api("POST", "/accounts/cash/ensure", {}, tok);
  ok("ensure cash", cash.j?.kind === "CASH", cash.j?.id);

  const today = new Date();
  const bookedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T12:00:00.000Z`;
  const month = bookedAt.slice(0, 7);

  await api(
    "POST",
    "/transactions",
    {
      direction: "INCOME",
      amount: 420,
      categoryKey: "other",
      description: "יתרת פתיחה · מזומן בכיס",
      accountId: cash.j.id,
      bookedAt,
    },
    tok,
  );
  const atm = await api(
    "POST",
    "/transactions/cash-atm-withdrawal",
    { amount: 100, bookedAt, description: "משיכת מזומן · כספומט" },
    tok,
  );
  ok("seed ATM", !!atm.j?.pairKey, atm.j?.pairKey);
  await api(
    "POST",
    "/transactions",
    {
      direction: "EXPENSE",
      amount: 35,
      categoryKey: "food",
      description: "קפה אימולטור",
      accountId: cash.j.id,
      bookedAt,
    },
    tok,
  );
  ok("seed cash expense", true);
}

try {
  sh(`"${adb}" shell am force-stop com.mtails.moneytail`);
  await sleep(800);
  sh(
    `"${adb}" shell am start -n com.mtails.moneytail/com.mtails.moneytail.MainActivity`,
  );
  await sleep(2500);

  const cdp = await connectCdp();
  ok("CDP connected", true);

  // Inject session + go to cash journal
  await cdp.evaluate(
    `localStorage.setItem('mt_token', ${JSON.stringify(tok)});`,
  );
  await cdp.goto(
    `${WEB_EMU}/app/cash?month=${new Date().toISOString().slice(0, 7)}`,
  );

  const cashUi = await waitFor(
    cdp.evaluate,
    `(() => {
      const t = document.body?.innerText || '';
      return {
        url: location.href,
        hasTitle: t.includes('מעקב מזומן') || t.includes('יומן כיס'),
        hasBalance: t.includes('יתרת מזומן') || /₪\\s*[\\d,]/.test(t),
        hasChips:
          t.includes('הכל') &&
          (t.includes('הוצאות') || t.includes('משיכות') || t.includes('היום')),
        hasCoffee: t.includes('קפה') || t.includes('אימולטור'),
        hasOpening: t.includes('יתרת פתיחה'),
        textSample: t.replace(/\\s+/g, ' ').slice(0, 280),
      };
    })()`,
    (v) =>
      v &&
      v.hasTitle &&
      v.hasChips &&
      (v.hasCoffee || v.hasOpening),
    { label: "cash page", timeoutMs: 35000 },
  );
  ok("emulator cash page title", cashUi.hasTitle, cashUi.url);
  ok("emulator cash balance/period", cashUi.hasBalance);
  ok("emulator cash chips", cashUi.hasChips);
  ok("emulator cash journal rows", cashUi.hasCoffee || cashUi.hasOpening, cashUi.textSample);

  // Home cash row
  await cdp.goto(
    `${WEB_EMU}/app?month=${new Date().toISOString().slice(0, 7)}`,
  );
  const homeUi = await waitFor(
    cdp.evaluate,
    `(() => {
      const t = document.body?.innerText || '';
      const link = [...document.querySelectorAll('a')].find(a =>
        (a.textContent || '').includes('מזומן בכיס') ||
        (a.getAttribute('href') || '').includes('/app/cash')
      );
      return {
        url: location.href,
        hasRow: t.includes('מזומן בכיס'),
        href: link?.getAttribute('href') || null,
      };
    })()`,
    (v) => v && v.hasRow,
    { label: "home cash row", timeoutMs: 30000 },
  );
  ok("emulator home cash row", homeUi.hasRow, homeUi.href);

  // Money ATM link
  await cdp.goto(
    `${WEB_EMU}/app/money?month=${new Date().toISOString().slice(0, 7)}`,
  );
  const moneyUi = await waitFor(
    cdp.evaluate,
    `(() => {
      const t = document.body?.innerText || '';
      const link = [...document.querySelectorAll('a')].find(a =>
        (a.textContent || '').includes('יומן כיס') ||
        (a.textContent || '').includes('מזומן ·')
      );
      return {
        url: location.href,
        onMoney: location.href.includes('/app/money'),
        hasAtmText: t.includes('משיכת מזומן') || t.includes('כספומט'),
        hasCashLink: !!link || t.includes('יומן כיס'),
        linkText: link?.textContent?.trim() || null,
      };
    })()`,
    (v) => v && v.onMoney && (v.hasAtmText || v.hasCashLink),
    { label: "money cash link", timeoutMs: 30000 },
  );
  ok("emulator money ATM text", moneyUi.hasAtmText, moneyUi.url);
  ok("emulator money → cash link", moneyUi.hasCashLink, moneyUi.linkText);

  // Sidebar nav item exists
  const nav = await cdp.evaluate(`(() => {
    const links = [...document.querySelectorAll('a,button')].map(el => (el.textContent || '').trim());
    return {
      hasNav: links.some(t => t.includes('מעקב מזומן')),
    };
  })()`);
  ok("emulator nav label מעקב מזומן", nav.hasNav);

  cdp.close();
} catch (e) {
  ok("emulator suite", false, e instanceof Error ? e.message : String(e));
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${failed.length ? "FAILED" : "ALL PASSED"} — ${results.filter((r) => r.pass).length}/${results.length}`,
);
process.exit(failed.length ? 1 : 0);
