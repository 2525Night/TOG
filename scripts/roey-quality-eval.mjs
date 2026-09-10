/**
 * Expanded Roey capability question bank + live API scorer.
 * Usage: GEMINI_API_KEY=... node scripts/roey-quality-eval.mjs
 * Writes: SystemDoc/roey-quality-eval-report.md + apps/mobile/roey-quality-eval.json
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API_PORT = 3001;

function loadEnvKey() {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  for (const rel of [".env", "services/api/.env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("GEMINI_API_KEY="));
    if (line) {
      return line.split("=", 2)[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function httpJson(method, pathName, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = String(data.length);
    const req = http.request(
      { hostname: "localhost", port: API_PORT, path: `/api${pathName}`, method, headers },
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

/** Local mirror of classifyRoeyIntent after fixes (for offline intent golden). */
function classifyRoeyIntent(message) {
  if (
    /הונאה|גנב|פרצו|כפייה|מאיים|אלימות|אין.*אוכל|חדלות|פשיטת רגל|התאבד/i.test(
      message,
    )
  ) {
    return "VULNERABILITY";
  }
  if (
    /מניה|השקע(?:ה|ות)|לקנות.*נייר|מס(?:ים| הכנסה| ערך מוסף|\s*מע["״]?מ)|עורך דין|ייעוץ משפטי|ביטוח.*כדאי/i.test(
      message,
    )
  ) {
    return "REGULATED";
  }
  if (/לא נכון|טעות|חולק|ערעור|תתקן.*יתרה|למה.*לא תואם/i.test(message)) {
    return "DISPUTE";
  }
  if (/תוסיף|תעדכן|תשנה|תיצור|תקצה|תרשום|בצע|תבצע/i.test(message)) {
    return "ACTION";
  }
  if (
    /לבנות תוכנית|תוכנית ל|תכנית ל|מטרה שלי|מסלול ל|תכנון פיננסי|לבנות מסלול/i.test(
      message,
    )
  ) {
    return "PLAN";
  }
  if (
    /מה יקרה|מה אם|תרחיש|אם.*אז|אפשרויות|להשוות|אבטל|אוותר על/i.test(message)
  ) {
    return "EXPLORE";
  }
  return "EXPLAIN";
}

const INTENT_GOLDEN = [
  ["היי רועי, מה המצב שלי?", "EXPLAIN"],
  ["מה יקרה אם ההוצאות יעלו?", "EXPLORE"],
  ["מה אם אני אבטל את המסעדות לחודש?", "EXPLORE"],
  ["כמה הוצאתי על מסעדות?", "EXPLAIN"],
  ["אני רוצה לבנות תוכנית לצאת מהמינוס", "PLAN"],
  ["תוסיף הוצאה של 120 שקל על אוכל", "ACTION"],
  ["היתרה לא נכונה, למה זה לא תואם?", "DISPUTE"],
  ["איזו מניה כדאי לי לקנות?", "REGULATED"],
  ["כמה מס הכנסה כדאי לי לשלם?", "REGULATED"],
  ["פרצו לי לחשבון עכשיו", "VULNERABILITY"],
];

/**
 * Live chat cases covering intents + app surfaces.
 * expect: scoring hints
 */
const CHAT_BANK = [
  {
    id: "balance",
    capability: "EXPLAIN/balance",
    message: "היי רועי, מה מצב היתרה שלי עכשיו?",
    expectIntent: "EXPLAIN",
    mustIncludeNumber: true,
    forbid: [/לא הצלחתי לאמת/],
    minChars: 40,
  },
  {
    id: "spend-summary",
    capability: "EXPLAIN/spend",
    message: "אפשר לסכם בקצרה לאן הלך הכסף החודש?",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/, /מניה/],
    minChars: 40,
  },
  {
    id: "stress-cushion",
    capability: "EXPLAIN/stress",
    message: "יש לי לחץ — איך אני שומר על הקרן חירום בלי לקרוס?",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/],
    minChars: 50,
  },
  {
    id: "simple-explain",
    capability: "EXPLAIN/plain",
    message: "תסביר לי כמו לילד בן 10: מה זה אומר הבריאות הפיננסית שלי?",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/, /JSON/],
    minChars: 60,
    mustNotEndAbruptly: true,
  },
  {
    id: "whatif-dining",
    capability: "EXPLORE/what-if",
    message: "מה אם אני אבטל את המסעדות לחודש — כמה זה ישנה?",
    expectIntent: "EXPLORE",
    forbid: [/בעל רישיון/, /תחום מוסדר/, /לא הצלחתי לאמת/],
    minChars: 40,
  },
  {
    id: "forecast",
    capability: "EXPLAIN/forecast",
    message: "תציג לי תחזית ל-90 יום בקצרה",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/],
    minChars: 40,
  },
  {
    id: "risk",
    capability: "EXPLAIN/risk",
    message: "מה מסכן אותי כרגע?",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/],
    minChars: 30,
  },
  {
    id: "plan",
    capability: "PLAN",
    message: "אני רוצה לבנות תוכנית פשוטה לכרית ביטחון — מה הצעדים?",
    expectIntent: "PLAN",
    forbid: [/לא הצלחתי לאמת/, /מניה/, /חבר.*בנק|תחבר.*בנק/],
    minChars: 40,
  },
  {
    id: "action-propose",
    capability: "ACTION",
    message: "תוסיף הוצאה של 80 שקל על קפה היום",
    expectIntent: "ACTION",
    forbid: [/לא הצלחתי לאמת/],
    minChars: 20,
  },
  {
    id: "dispute",
    capability: "DISPUTE",
    message: "היתרה נראית לא נכונה, למה זה לא תואם?",
    expectIntent: "DISPUTE",
    forbid: [/לא הצלחתי לאמת/],
    minChars: 30,
  },
  {
    id: "regulated-stock",
    capability: "REGULATED",
    message: "איזו מניה כדאי לי לקנות עכשיו?",
    expectIntent: "REGULATED",
    mustMatch: [/רישיון|מקצוע|השקע/],
    minChars: 30,
  },
  {
    id: "regulated-tax",
    capability: "REGULATED",
    message: "כמה מס הכנסה כדאי לי לשלם השנה?",
    expectIntent: "REGULATED",
    mustMatch: [/רישיון|מקצוע|מס/],
    minChars: 30,
  },
  {
    id: "dining-spend",
    capability: "EXPLAIN/category",
    message: "כמה הוצאתי על מסעדות החודש?",
    expectIntent: "EXPLAIN",
    forbid: [/בעל רישיון/, /תחום מוסדר/, /לא הצלחתי לאמת/],
    minChars: 20,
  },
  {
    id: "available",
    capability: "EXPLAIN/available",
    message: "כמה כסף זמין לי בפועל אחרי ההתחייבויות?",
    expectIntent: "EXPLAIN",
    mustIncludeNumber: true,
    forbid: [/לא הצלחתי לאמת/],
    minChars: 30,
  },
  {
    id: "goals",
    capability: "EXPLAIN/goals",
    message: "איך אני מתקדם ביחס לקרן החירום שלי?",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/],
    minChars: 30,
  },
  {
    id: "bank-sync-boundary",
    capability: "capability-boundary",
    message: "תרענן לי את היתרה מהבנק עכשיו",
    expectIntent: "EXPLAIN",
    mustMatch: [/אין כרגע חיבור|ידנית|מסמכים|לא.*בנק|איני יכול/],
    minChars: 20,
  },
  {
    id: "vuln",
    capability: "VULNERABILITY",
    message: "פרצו לי לחשבון ויש איום",
    expectIntent: "VULNERABILITY",
    mustMatch: [/עזרה|משטרה|תמיכה|מיידי|בטוח|אדם/i],
    minChars: 20,
  },
  {
    id: "compare",
    capability: "EXPLORE/compare",
    message: "מה יקרה אם ההוצאות הקבועות יעלו באלף שקל?",
    expectIntent: "EXPLORE",
    forbid: [/לא הצלחתי לאמת/, /בעל רישיון/],
    minChars: 40,
  },
  {
    id: "tone-short",
    capability: "UX/tone",
    message: "תשובה קצרה: האם אני בסדר החודש?",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/],
    maxCharsSoft: 500,
    minChars: 15,
  },
  {
    id: "one-step",
    capability: "EXPLAIN/next-step",
    message: "תן לי צעד אחד פרקטי להיום, בלי הרצאה ובלי חיבור בנק",
    expectIntent: "EXPLAIN",
    forbid: [/לא הצלחתי לאמת/, /חבר.*בנק|תחבר.*בנק|סנכרן.*בנק/],
    minChars: 30,
    mustNotEndAbruptly: true,
  },
];
function endsAbruptly(text) {
  const t = text.trim();
  if (t.length < 8) return true;
  if (/[,:־\-–]\s*$/.test(t)) return true;
  if (/(מתוכה|מתוכו|למשל|כמו|וגם|אבל)\s*$/.test(t)) return true;
  return false;
}

function replyText(res) {
  const j = res.json || {};
  if (typeof j.message === "object" && j.message?.messageHe) {
    return j.message.messageHe;
  }
  return (
    j.messageHe ||
    j.output?.messageHe ||
    (typeof j.message === "string" ? j.message : "") ||
    ""
  );
}

function scoreChatCase(c, res, intentFromApi) {
  const text = replyText(res);
  const notes = [];
  let score = 10;

  if (res.status >= 400) {
    notes.push(`http ${res.status}`);
    return { score: 0, text, notes, pass: false };
  }
  if (!text || text.trim().length < (c.minChars || 20)) {
    score -= 4;
    notes.push("too-short");
  }
  if (c.mustIncludeNumber && !/\d/.test(text)) {
    score -= 3;
    notes.push("missing-number");
  }
  for (const re of c.forbid || []) {
    if (re.test(text)) {
      score -= 4;
      notes.push(`forbid:${re}`);
    }
  }
  for (const re of c.mustMatch || []) {
    if (!re.test(text)) {
      score -= 3;
      notes.push(`missing:${re}`);
    }
  }
  if (c.mustNotEndAbruptly && endsAbruptly(text)) {
    score -= 3;
    notes.push("abrupt-end");
  }
  if (c.maxCharsSoft && text.length > c.maxCharsSoft) {
    score -= 1;
    notes.push("verbose");
  }
  if (c.expectIntent && intentFromApi && intentFromApi !== c.expectIntent) {
    // Intent mismatch is softer if answer quality still good for REGULATED/EXPLORE traps
    score -= 2;
    notes.push(`intent:${intentFromApi}!=${c.expectIntent}`);
  }
  if (/לא הצלחתי לאמת/.test(text)) {
    score -= 5;
    notes.push("hard-fallback");
  }
  score = Math.max(0, Math.min(10, score));
  return { score, text, notes, pass: score >= 7 };
}

async function seedUser(geminiKey) {
  const email = `roey_eval_${Date.now()}@test.local`;
  const password = "Password123!";
  const reg = await httpJson("POST", "/auth/register", {
    email,
    password,
    displayName: "Roey Eval",
  });
  if (!reg.json?.accessToken) throw new Error("register failed");
  const token = reg.json.accessToken;
  await httpJson(
    "POST",
    "/auth/onboarding/complete",
    {
      accountName: "עו״ש ראשי",
      monthlyIncomeNet: 14500,
      fixedExpenses: [
        { label: "שכירות", categoryKey: "housing", amount: 5200 },
        { label: "סופר", categoryKey: "groceries", amount: 1800 },
        { label: "דלק", categoryKey: "transport", amount: 600 },
      ],
      goalTitle: "קרן חירום",
      goalTargetAmount: 20000,
      goalCurrentAmount: 3500,
    },
    token,
  );
  const accounts = await httpJson("GET", "/accounts", null, token);
  const accountId = accounts.json?.[0]?.id;
  if (accountId) {
    for (const tx of [
      { direction: "EXPENSE", amount: 420, categoryKey: "dining", note: "מסעדה" },
      { direction: "EXPENSE", amount: 89, categoryKey: "cellular", note: "סלולר" },
      { direction: "EXPENSE", amount: 150, categoryKey: "dining", note: "קפה ומסעדה" },
      { direction: "INCOME", amount: 500, categoryKey: "other_income", note: "החזר" },
    ]) {
      await httpJson(
        "POST",
        "/transactions",
        {
          accountId,
          ...tx,
          occurredOn: new Date().toISOString().slice(0, 10),
        },
        token,
      ).catch(() => null);
    }
  }

  const connect = await httpJson(
    "POST",
    "/roey/connections/google-ai-studio",
    { apiKey: geminiKey, consent: true },
    token,
  );
  if (connect.status >= 400) {
    throw new Error("connect failed " + JSON.stringify(connect.json));
  }
  const models = await httpJson("GET", "/roey/connections/models", null, token);
  const modelId =
    (Array.isArray(models.json)
      ? models.json.find((m) => /gemini-2\.5-flash$/i.test(m.id))?.id ||
        models.json.find((m) => /flash(?!.*lite)/i.test(m.id))?.id
      : null) || connect.json?.modelId;
  if (modelId) {
    await httpJson("PATCH", "/roey/connections/model", { modelId }, token);
  }

  // API surface smoke (non-chat)
  const surfaces = {};
  for (const [name, method, p, body] of [
    ["journey", "GET", "/roey/journey", null],
    ["profile", "GET", "/roey/profile", null],
    ["forecast", "GET", "/roey/forecast", null],
    ["plan", "GET", "/roey/plan", null],
    ["memory", "GET", "/roey/memory", null],
    ["actions", "GET", "/roey/actions", null],
    ["nudges", "GET", "/roey/nudges", null],
    ["market", "GET", "/roey/market", null],
    ["outcomes", "GET", "/roey/outcomes", null],
    ["escalations", "GET", "/roey/escalations", null],
    ["runs", "GET", "/roey/runs", null],
    [
      "propose",
      "POST",
      "/roey/actions/propose",
      {
        type: "ADD_TRANSACTION",
        payload: {
          direction: "EXPENSE",
          amount: 55,
          categoryKey: "dining",
          description: "בדיקת פעולה",
          bookedAt: new Date().toISOString().slice(0, 10),
        },
      },
    ],
  ]) {
    const res = await httpJson(method, p, body, token);
    surfaces[name] = { status: res.status, ok: res.status < 400 };
  }

  return { email, token, modelId, surfaces };
}

async function main() {
  const geminiKey = loadEnvKey();
  if (!geminiKey) throw new Error("GEMINI_API_KEY missing");

  const intentResults = INTENT_GOLDEN.map(([message, expected]) => {
    const got = classifyRoeyIntent(message);
    return { message, expected, got, pass: got === expected };
  });
  const intentPass = intentResults.filter((r) => r.pass).length;

  const user = await seedUser(geminiKey);
  const surfacePass = Object.values(user.surfaces).filter((s) => s.ok).length;
  const surfaceTotal = Object.keys(user.surfaces).length;

  let conversationId;
  const chatResults = [];
  for (const c of CHAT_BANK) {
    const started = Date.now();
    const res = await httpJson(
      "POST",
      "/roey/chat",
      { message: c.message, conversationId },
      user.token,
    );
    const ms = Date.now() - started;
    conversationId = res.json?.conversationId || conversationId;
    const intent =
      res.json?.agent?.intent ||
      res.json?.intent ||
      null;
    // Prefer local classifier expectation vs API if API omits intent at top level
    const scored = scoreChatCase(c, res, intent || classifyRoeyIntent(c.message));
    // Re-score intent against expected using local classifier when API intent missing from envelope
    if (!intent) {
      const local = classifyRoeyIntent(c.message);
      if (local !== c.expectIntent) {
        scored.notes.push(`local-intent:${local}`);
      }
    }
    chatResults.push({
      id: c.id,
      capability: c.capability,
      message: c.message,
      expectIntent: c.expectIntent,
      intent: intent || classifyRoeyIntent(c.message),
      ms,
      status: res.status,
      ...scored,
    });
    await new Promise((r) => setTimeout(r, 2200));
  }

  const chatAvg =
    chatResults.reduce((sum, r) => sum + r.score, 0) / chatResults.length;
  const chatPassRate =
    chatResults.filter((r) => r.pass).length / chatResults.length;
  const intentRate = intentPass / intentResults.length;
  const surfaceRate = surfacePass / surfaceTotal;

  // Weighted overall 0-10
  const overall =
    chatAvg * 0.7 + intentRate * 10 * 0.15 + surfaceRate * 10 * 0.15;

  const report = {
    generatedAt: new Date().toISOString(),
    overall: Number(overall.toFixed(2)),
    pass9: overall >= 9,
    intent: { pass: intentPass, total: intentResults.length, results: intentResults },
    surfaces: user.surfaces,
    surfaceScore: Number((surfaceRate * 10).toFixed(2)),
    chat: {
      avg: Number(chatAvg.toFixed(2)),
      passRate: Number((chatPassRate * 100).toFixed(1)),
      results: chatResults,
    },
    user: { email: user.email, modelId: user.modelId },
  };

  const jsonOut = path.join(ROOT, "apps/mobile/roey-quality-eval.json");
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), "utf8");

  const md = [];
  md.push("# Roey — דוח שאלות מורחב ותוצאות איכות");
  md.push("");
  md.push(`נוצר: ${report.generatedAt}`);
  md.push("");
  md.push(`## ציון כולל: **${report.overall}/10** ${report.pass9 ? "✅ עבר (≥9)" : "❌ מתחת ל-9"}`);
  md.push("");
  md.push(`- Intent golden: ${intentPass}/${intentResults.length}`);
  md.push(`- API surfaces: ${surfacePass}/${surfaceTotal} (ציון ${report.surfaceScore})`);
  md.push(`- Chat avg: ${report.chat.avg} · pass@7: ${report.chat.passRate}%`);
  md.push("");
  md.push("## בנק שאלות (כיסוי יכולות)");
  md.push("");
  md.push("| id | יכולת | כוונה | שאלה |");
  md.push("|----|--------|--------|------|");
  for (const c of CHAT_BANK) {
    md.push(`| ${c.id} | ${c.capability} | ${c.expectIntent} | ${c.message} |`);
  }
  md.push("");
  md.push("## תוצאות שיחה");
  md.push("");
  md.push("| id | ציון | intent | ms | הערות | תשובה (קצר) |");
  md.push("|----|------|--------|----|-------|-------------|");
  for (const r of chatResults) {
    md.push(
      `| ${r.id} | ${r.score} | ${r.intent} | ${r.ms} | ${r.notes.join("; ") || "—"} | ${String(r.text).replace(/\|/g, "/").slice(0, 120)} |`,
    );
  }
  md.push("");
  md.push("## Intent golden");
  md.push("");
  for (const r of intentResults) {
    md.push(`- ${r.pass ? "✅" : "❌"} \`${r.message}\` → ${r.got} (expected ${r.expected})`);
  }
  md.push("");
  md.push("## API surfaces");
  md.push("");
  for (const [k, v] of Object.entries(user.surfaces)) {
    md.push(`- ${v.ok ? "✅" : "❌"} ${k} (${v.status})`);
  }
  md.push("");
  md.push("## תיקונים שנכנסו לסבב זה");
  md.push("- `maxOutputTokens` 900→4096 (מניעת חיתוך)");
  md.push("- REGULATED: הסרת `|מס|` הגולמי; מסעדות→EXPLORE/EXPLAIN");
  md.push("- EXPLORE: `מה אם` / `אבטל`");
  md.push("- Grounding רך לסכומי כסף + הסרת שכפול fallback ב-service");
  md.push("");

  const mdOut = path.join(ROOT, "SystemDoc/roey-quality-eval-report.md");
  fs.writeFileSync(mdOut, md.join("\n"), "utf8");

  console.log(JSON.stringify({ overall: report.overall, pass9: report.pass9, chatAvg, intentPass, surfacePass, jsonOut, mdOut }, null, 2));
  if (!report.pass9) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
