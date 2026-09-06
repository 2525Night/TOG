const http = require("http");

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = data.length;
    const r = http.request(
      { hostname: "localhost", port: 3001, path: `/api${path}`, method, headers },
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
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode, body: b }));
      })
      .on("error", reject);
  });
}

(async () => {
  for (let i = 0; i < 20; i++) {
    try {
      const h = await req("GET", "/health");
      if (h.status === 200) break;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const email = `onboard_${Date.now()}@test.local`;
  const reg = await req("POST", "/auth/register", {
    email,
    password: "password123",
    displayName: "Onboard Test",
  });
  if (!reg.json?.accessToken) throw new Error("register failed " + JSON.stringify(reg));
  if (reg.json.user.onboardingCompleted !== false) {
    throw new Error("new user should not be onboarded");
  }
  const token = reg.json.accessToken;

  const me1 = await req("GET", "/auth/me", null, token);
  if (me1.json.onboardingCompleted !== false) throw new Error("me flag wrong");

  const done = await req(
    "POST",
    "/auth/onboarding/complete",
    {
      accountName: "עו״ש ראשי",
      startingBalance: 3000,
      monthlyIncomeNet: 12000,
      fixedExpenses: [
        { label: "שכירות", categoryKey: "housing", amount: 4500 },
        { label: "סלולר", categoryKey: "cellular", amount: 59 },
      ],
      goalTitle: "קרן חירום",
      goalTargetAmount: 10000,
      goalCurrentAmount: 500,
    },
    token,
  );
  if (!done.json?.ok) throw new Error("onboarding failed " + JSON.stringify(done));

  const me2 = await req("GET", "/auth/me", null, token);
  if (me2.json.onboardingCompleted !== true) throw new Error("flag not set");

  const sum = await req("GET", "/dashboard/summary", null, token);
  if (sum.json.incomeMtd < 12000) throw new Error("income missing");
  if (sum.json.goals?.length < 1) throw new Error("goal missing");

  const home = await get("http://localhost:3005/");
  const onboardPage = await get("http://localhost:3005/app/onboarding");
  if (home.status !== 200 || !home.body.includes("MoneyTail")) {
    throw new Error("web home failed");
  }
  if (onboardPage.status !== 200) throw new Error("onboarding page failed");

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        balance: sum.json.availableBalance,
        completeness: sum.json.completeness,
        healthScore: sum.json.healthScore,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
