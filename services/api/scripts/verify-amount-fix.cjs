const tsNode = require("ts-node");
tsNode.register({
  transpileOnly: true,
  compilerOptions: { module: "commonjs" },
});
const {
  resolveAmountAndDescription,
  parseUnstructuredText,
} = require("../src/documents/extract.ts");
const { classifyDirection } = require("../src/documents/direction-classifier.ts");
const { resolveCategory } = require("../src/documents/category-resolver.ts");

const cases = [
  {
    name: "isracard fee",
    description: "ישראכרט )י( -74.90",
    columnAmount: 5822.32,
    balance: 5822.32,
    prevBalance: 5897.22,
    expectAmount: 74.9,
    expectDir: "EXPENSE",
  },
  {
    name: "credit journal",
    description: "יומן זכות 5,000.00",
    columnAmount: 10822.32,
    balance: 10822.32,
    prevBalance: 5822.32,
    expectAmount: 5000,
    expectDir: "INCOME",
  },
  {
    name: "internet transfer",
    description: "העברה באינטרנט )י( -350.00",
    columnAmount: 10472.32,
    balance: 10472.32,
    prevBalance: 10822.32,
    expectAmount: 350,
    expectDir: "EXPENSE",
    expectCatNot: "internet",
  },
  {
    name: "bank credit",
    description: "זיכוי - בנק הפועלים)י( 2,600.00",
    columnAmount: 18899.9,
    balance: 18899.9,
    prevBalance: 16299.9,
    expectAmount: 2600,
    expectDir: "INCOME",
  },
  {
    name: "correct column already",
    description: "קצבת ילדים-י",
    columnAmount: 276,
    balance: 5000,
    prevBalance: 4724,
    expectAmount: 276,
    expectDir: "INCOME",
  },
];

let fail = 0;
for (const c of cases) {
  const resolved = resolveAmountAndDescription({
    description: c.description,
    columnAmount: c.columnAmount,
    balance: c.balance,
    prevBalance: c.prevBalance,
  });
  const dir = classifyDirection({
    description: resolved.description,
    amount: resolved.amount,
    credit: resolved.credit,
    debit: resolved.debit,
    balance: c.balance,
    prevBalance: c.prevBalance,
  });
  const cat = resolveCategory(resolved.description, dir.direction);
  const okAmount = Math.abs(resolved.amount - c.expectAmount) < 0.051;
  const okDir = dir.direction === c.expectDir;
  const okCat = c.expectCatNot ? cat.categoryKey !== c.expectCatNot : true;
  const ok = okAmount && okDir && okCat;
  if (!ok) fail++;
  console.log(
    JSON.stringify({
      name: c.name,
      ok,
      amount: resolved.amount,
      expectAmount: c.expectAmount,
      desc: resolved.description,
      dir: dir.direction,
      expectDir: c.expectDir,
      cat: cat.categoryKey,
      credit: resolved.credit,
      debit: resolved.debit,
    }),
  );
}

const sampleText = `
דף חשבון
לתקופה: 18.05.2026 - 18.08.2026
24.05.2026\tישראכרט )י( -74.90\t5,822.32\t₪\t5,822.32\t₪
28.05.2026\tיומן זכות 5,000.00\t10,822.32\t₪\t10,822.32\t₪
29.05.2026\tהעברה באינטרנט )י( -350.00\t10,472.32\t₪\t10,472.32\t₪
14.06.2026\tזיכוי - בנק הפועלים)י( 2,600.00\t18,899.90\t₪\t18,899.90\t₪
`.trim();

const rows = parseUnstructuredText(sampleText);
console.log(
  "PARSE",
  JSON.stringify(
    rows.map((r) => ({
      amount: r.amount,
      dir: r.direction,
      cat: r.categoryKey,
      desc: r.description,
    })),
    null,
    2,
  ),
);

console.log(fail === 0 ? "ALL_PASS" : `FAILS_${fail}`);
process.exit(fail === 0 ? 0 : 1);
