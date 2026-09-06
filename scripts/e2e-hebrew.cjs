const http = require("http");

const email = `ui_${Date.now()}@test.local`;
const pass = "password123";

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = data.length;
    const r = http.request(
      { hostname: "localhost", port: 3001, path: `/api${path}`, method, headers },
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(b || "null") });
          } catch {
            resolve({ status: res.statusCode, raw: b });
          }
        });
      },
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const reg = await req("POST", "/auth/register", {
    email,
    password: pass,
    displayName: "בדיקה",
  });
  if (!reg.json?.accessToken) {
    console.error("register failed", reg);
    process.exit(1);
  }
  const token = reg.json.accessToken;

  const acc = await req(
    "POST",
    "/accounts",
    { name: "עו״ש ראשי", kind: "BANK", currentBalance: 2500 },
    token,
  );
  const tx = await req(
    "POST",
    "/transactions",
    {
      direction: "EXPENSE",
      amount: 45.5,
      categoryKey: "food",
      bookedAt: new Date().toISOString(),
      accountId: acc.json.id,
      description: "קפה",
    },
    token,
  );
  const goal = await req(
    "POST",
    "/goals",
    { title: "קרן חירום", targetAmount: 10000, currentAmount: 1500 },
    token,
  );
  const sum = await req("GET", "/dashboard/summary", null, token);

  const hebrewOk =
    typeof acc.json.name === "string" &&
    acc.json.name.includes("ראשי") &&
    typeof goal.json.title === "string" &&
    goal.json.title.includes("חירום") &&
    typeof tx.json.description === "string" &&
    tx.json.description.includes("קפה");

  const numbersOk =
    sum.json.expenseMtd >= 45 &&
    Math.abs(sum.json.availableBalance - (2500 - 45.5)) < 0.01;

  console.log(
    JSON.stringify(
      {
        ok: hebrewOk && numbersOk,
        email,
        accountName: acc.json.name,
        goalTitle: goal.json.title,
        txDescription: tx.json.description,
        expenseMtd: sum.json.expenseMtd,
        balance: sum.json.availableBalance,
        completeness: sum.json.completeness,
      },
      null,
      2,
    ),
  );
  if (!(hebrewOk && numbersOk)) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
