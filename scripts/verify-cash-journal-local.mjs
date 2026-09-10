/**
 * Extended local verification — Pocket Journal + integrations.
 * Avoids browser screenshots (they hang in this environment).
 * Uses API + light HTML/route checks only.
 *
 *   node scripts/verify-cash-journal-local.mjs
 */
const API = (process.env.API_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const WEB = (process.env.WEB_URL || "http://127.0.0.1:3005").replace(/\/$/, "");

async function api(method, path, body, token) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data?.message ||
      (typeof data === "string" ? data : JSON.stringify(data));
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== verify-cash-journal-local ===");
  console.log(`API ${API} · WEB ${WEB}`);
  console.log("(no browser screenshots — API + route smoke only)\n");

  const health = await fetch(`${API}/api/health`)
    .then((r) => r.json())
    .catch(() => null);
  assert(health, "API health failed — start npm run dev:api");
  console.log("✓ API health");

  const webOk = await fetch(WEB)
    .then((r) => r.ok || r.status < 500)
    .catch(() => false);
  assert(webOk, "Web not reachable — start npm run dev:web");
  console.log("✓ Web reachable");

  const stamp = Date.now();
  const email = `cash_${stamp}@test.local`;
  const password = "Password123!";
  const reg = await api("POST", "/auth/register", {
    email,
    password,
    displayName: "בדיקת מזומן",
  });
  const token = reg.accessToken;
  assert(token, "register did not return accessToken");
  console.log(`✓ Registered ${email}`);

  await api(
    "POST",
    "/auth/onboarding/complete",
    {
      accountName: "עו״ש",
      monthlyIncomeNet: 14000,
      creditCards: [
        {
          name: "מקס בדיקה",
          currentBalance: 800,
          creditLimit: 12000,
        },
      ],
      fixedExpenses: [{ label: "שכירות", categoryKey: "housing", amount: 4500 }],
      goalTitle: "רזרבה",
      goalTargetAmount: 3000,
      goalCurrentAmount: 0,
    },
    token,
  );
  console.log("✓ Onboarding complete");

  const cash = await api("POST", "/accounts/cash/ensure", {}, token);
  assert(cash?.id && cash.kind === "CASH", "ensureCash did not return CASH");
  const before = Number(cash.currentBalance);
  console.log(`✓ CASH account ${cash.id} balance=${before}`);

  const today = new Date();
  const bookedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T12:00:00.000Z`;
  const month = bookedAt.slice(0, 7);

  const bankBefore = await api("GET", "/accounts", null, token);
  const bank = (bankBefore || []).find((a) => a.kind === "BANK");
  assert(bank, "missing BANK after onboarding");
  const bankBalBefore = Number(bank.currentBalance);

  // Opening balance (INCOME on CASH)
  const opening = await api(
    "POST",
    "/transactions",
    {
      direction: "INCOME",
      amount: 420,
      categoryKey: "other",
      description: "יתרת פתיחה · מזומן בכיס",
      accountId: cash.id,
      bookedAt,
    },
    token,
  );
  assert(opening?.id, "opening balance tx missing");
  console.log("✓ Opening balance +₪420");

  const atm = await api(
    "POST",
    "/transactions/cash-atm-withdrawal",
    { amount: 100, bookedAt, description: "משיכת מזומן · בדיקה" },
    token,
  );
  assert(atm?.cashTx?.id && atm?.bankTx?.id, "ATM dual-write missing txs");
  assert(String(atm.pairKey || "").startsWith("cash-atm:"), "pairKey missing");
  console.log(`✓ ATM dual-write pair=${atm.pairKey}`);

  const afterAtmCash = await api("POST", "/accounts/cash/ensure", {}, token);
  assert(
    Math.abs(Number(afterAtmCash.currentBalance) - (before + 420 + 100)) < 0.01,
    `cash after ATM expected ${before + 520}, got ${afterAtmCash.currentBalance}`,
  );
  console.log(`✓ Cash balance after opening+ATM = ${afterAtmCash.currentBalance}`);

  const accountsAfter = await api("GET", "/accounts", null, token);
  const bankAfter = accountsAfter.find((a) => a.kind === "BANK");
  assert(
    Math.abs(Number(bankAfter.currentBalance) - (bankBalBefore - 100)) < 0.01,
    `bank after ATM expected ${bankBalBefore - 100}, got ${bankAfter.currentBalance}`,
  );
  console.log(`✓ Bank balance after ATM = ${bankAfter.currentBalance}`);

  const expense = await api(
    "POST",
    "/transactions",
    {
      direction: "EXPENSE",
      amount: 35,
      categoryKey: "food",
      description: "קפה בדיקה",
      accountId: cash.id,
      bookedAt,
    },
    token,
  );
  assert(expense?.id, "cash expense not created");
  console.log(`✓ Cash expense ${expense.id}`);

  const afterExp = await api("POST", "/accounts/cash/ensure", {}, token);
  const expected = before + 420 + 100 - 35;
  assert(
    Math.abs(Number(afterExp.currentBalance) - expected) < 0.01,
    `cash after expense expected ${expected}, got ${afterExp.currentBalance}`,
  );
  console.log(`✓ Cash balance after expense = ${afterExp.currentBalance}`);

  const list = await api(
    "GET",
    `/transactions?accountId=${encodeURIComponent(cash.id)}&month=${month}&limit=50`,
    null,
    token,
  );
  assert(Array.isArray(list.items), "list.items missing");
  assert(
    list.items.some((t) => t.id === expense.id),
    "expense not in cash journal",
  );
  assert(
    list.items.some((t) => t.id === atm.cashTx.id),
    "ATM cash leg not in journal",
  );
  console.log(`✓ Journal filter returned ${list.items.length} items`);

  const kindList = await api(
    "GET",
    `/transactions?accountKind=CASH&month=${month}&limit=20`,
    null,
    token,
  );
  assert(
    kindList.items.some((t) => t.id === expense.id),
    "accountKind=CASH missing expense",
  );
  console.log(`✓ accountKind=CASH ok (${kindList.items.length})`);

  // Money list should include bank ATM leg with sourceReference
  const moneyList = await api(
    "GET",
    `/transactions?month=${month}&limit=50`,
    null,
    token,
  );
  const bankAtm = (moneyList.items || []).find((t) => t.id === atm.bankTx.id);
  assert(bankAtm, "bank ATM leg missing from money list");
  assert(
    String(bankAtm.sourceReference || "").startsWith("cash-atm:"),
    "bank ATM missing cash-atm sourceReference",
  );
  console.log("✓ Money list has ATM leg with cash-atm link key");

  await api("DELETE", `/transactions/${expense.id}`, null, token);
  const afterDel = await api("POST", "/accounts/cash/ensure", {}, token);
  assert(
    Math.abs(Number(afterDel.currentBalance) - (before + 520)) < 0.01,
    `balance after delete expected ${before + 520}, got ${afterDel.currentBalance}`,
  );
  console.log("✓ Delete expense restored cash balance");

  // Route smoke (no screenshot)
  for (const path of ["/app/cash", "/app", "/app/money", "/login"]) {
    const status = await fetch(`${WEB}${path}`).then((r) => r.status);
    assert(
      [200, 302, 307, 308, 401, 403].includes(status),
      `Unexpected ${path} status ${status}`,
    );
    console.log(`✓ Web ${path} status=${status}`);
  }

  // Source presence checks (compiled page shell / module graph via Next)
  const cashPage = await fetch(`${WEB}/app/cash`).then((r) => r.text());
  assert(
    cashPage.includes("מעקב מזומן") ||
      cashPage.includes("cash") ||
      cashPage.includes("__NEXT"),
    "cash page HTML unexpected",
  );
  console.log("✓ /app/cash HTML shell ok");

  console.log("\nALL CASH JOURNAL CHECKS PASSED");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message || e);
  process.exit(1);
});
