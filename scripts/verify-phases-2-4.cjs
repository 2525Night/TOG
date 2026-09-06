/**
 * End-to-end verification for MoneyTail phases 2–4.
 * UTF-8 safe (avoid PowerShell JSON Hebrew corruption).
 */
const API = process.env.API_URL || "http://localhost:3001/api";

async function req(path, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.message || text || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(msg)}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const email = `p24_${Date.now()}@test.local`;
  const password = "TestPass123!";

  console.log("1) Register…");
  const auth = await req("/auth/register", {
    method: "POST",
    body: { email, password, displayName: "בודק שלבים" },
  });
  const token = auth.accessToken || auth.token;
  assert(token, "missing token");

  await req("/auth/onboarding/complete", {
    method: "POST",
    token,
    body: {
      accountName: "עוש ראשי",
      startingBalance: 5000,
      monthlyIncomeNet: 12000,
      fixedExpenses: [
        { label: "שכירות", categoryKey: "housing", amount: 3500 },
      ],
      goalTitle: "קרן חירום",
      goalTargetAmount: 20000,
      goalCurrentAmount: 1000,
    },
  }).catch(() => undefined);

  console.log("2) Seed accounts + transactions (MoM / patterns)…");
  const account = await req("/accounts", {
    method: "POST",
    token,
    body: { name: "עוש בדיקה", kind: "BANK", currentBalance: 8000 },
  });

  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 12);
  const seeds = [
    {
      direction: "INCOME",
      amount: 12000,
      categoryKey: "salary",
      description: "משכורת",
      bookedAt: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      accountId: account.id,
    },
    {
      direction: "EXPENSE",
      amount: 2200,
      categoryKey: "food",
      description: "סופר רמי לוי",
      bookedAt: new Date(now.getFullYear(), now.getMonth(), 3).toISOString(),
      accountId: account.id,
    },
    {
      direction: "EXPENSE",
      amount: 180,
      categoryKey: "cellular",
      description: "סלקום",
      bookedAt: new Date(now.getFullYear(), now.getMonth(), 4).toISOString(),
      accountId: account.id,
    },
    {
      direction: "EXPENSE",
      amount: 180,
      categoryKey: "cellular",
      description: "סלקום",
      bookedAt: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
      accountId: account.id,
    },
    {
      direction: "EXPENSE",
      amount: 1500,
      categoryKey: "shopping",
      description: "קניות אחרי משכורת",
      bookedAt: new Date(now.getFullYear(), now.getMonth(), 2).toISOString(),
      accountId: account.id,
    },
    {
      direction: "EXPENSE",
      amount: 900,
      categoryKey: "food",
      description: "סופר",
      bookedAt: prev.toISOString(),
      accountId: account.id,
    },
    {
      direction: "INCOME",
      amount: 12000,
      categoryKey: "salary",
      description: "משכורת",
      bookedAt: new Date(prev.getFullYear(), prev.getMonth(), 1).toISOString(),
      accountId: account.id,
    },
  ];
  for (const s of seeds) {
    await req("/transactions", { method: "POST", token, body: s });
  }

  console.log("3) Phase 2 — reports + dashboard MoM…");
  const report = await req("/reports/overview?months=6", { token });
  assert(Array.isArray(report.monthlySeries), "monthlySeries missing");
  assert(report.mom?.expense, "mom.expense missing");
  assert(typeof report.narrativeHe === "string", "narrativeHe missing");
  assert(
    report.categoryBreakdown?.[0]?.labelHe,
    "category Hebrew labels missing",
  );

  const dash = await req("/dashboard/summary", { token });
  assert(dash.monthlySeries?.length >= 2, "dashboard monthlySeries");
  assert(dash.mom?.expense, "dashboard mom");
  assert(dash.topCategories?.[0]?.labelHe, "dashboard Hebrew categories");

  console.log("4) Phase 3 — CSV upload → confirm…");
  const csv = [
    "date,amount,description,type",
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-08,45,פז תדלוק,expense`,
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-09,12000,משכורת בונוס,income`,
  ].join("\n");

  const fd = new FormData();
  fd.append(
    "file",
    new Blob([csv], { type: "text/csv" }),
    "sample.csv",
  );
  fd.append("storageMode", "TEMPORARY");

  const uploaded = await req("/documents/upload", {
    method: "POST",
    token,
    formData: fd,
  });
  assert(uploaded.draft?.length >= 2, "draft rows expected");
  const confirmed = await req(`/documents/${uploaded.id}/confirm`, {
    method: "POST",
    token,
    body: {},
  });
  assert(confirmed.imported >= 2, "import count");

  console.log("5) Phase 4 — patterns / alerts / ranked recs…");
  const analysis = await req("/insights/analysis", { token });
  assert(Array.isArray(analysis.patterns), "patterns");
  assert(Array.isArray(analysis.recommendations), "recommendations");
  assert(analysis.recommendations[0]?.score != null, "ranked score");
  console.log(
    `   patterns=${analysis.patterns.length}, alerts=${analysis.alerts.length}, recs=${analysis.recommendations.length}`,
  );

  if (analysis.alerts[0]) {
    const d = await req(`/alerts/${analysis.alerts[0].id}/dismiss`, {
      method: "POST",
      token,
      body: {},
    });
    assert(d.ok, "dismiss alert");
  }

  console.log("OK — phases 2–4 verified.");
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
