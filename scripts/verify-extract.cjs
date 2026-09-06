/**
 * Verify unstructured + payslip parsers (no server required).
 */
const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  // Compile-free: duplicate minimal checks by requiring ts via ts-node if available,
  // else inline mirror of parser expectations after build.
  const tsNode = require("ts-node");
  tsNode.register({ transpileOnly: true, compilerOptions: { module: "commonjs" } });
  const {
    parseUnstructuredText,
    parseCsvTransactions,
  } = require("../services/api/src/documents/extract.ts");

  const csv = parseCsvTransactions(
    "date,amount,description,type\n2026-03-01,50,פז,expense\n2026-03-02,10000,משכורת,income\n",
  );
  if (csv.length !== 2) throw new Error(`csv expected 2 got ${csv.length}`);

  const statement = parseUnstructuredText(`
דף חשבון
15/01/2026 סופר רמי לוי 120.50 15240.40
16/01/2026 פז תדלוק 210.00 15030.40
17/01/2026 משכורת זכות 12000.00 27030.40
`);
  if (statement.length < 2) {
    throw new Error(`statement rows expected >=2 got ${statement.length}`);
  }
  // Prefer txn amount (not balance): first money before last
  const food = statement.find((r) => /רמי|סופר/i.test(r.description));
  if (food && food.amount > 1000) {
    throw new Error(`expected txn amount not balance, got ${food.amount}`);
  }

  // Balance-only OCR reconstruction
  const balOnly = parseUnstructuredText(`
28/06/2026 משיכת מזומן 25094.86
28/06/2026 כרטיס דביט 24985.96
`);
  if (balOnly.length < 1) throw new Error("balance-diff expected rows");
  const diff = balOnly.find((r) => Math.abs(r.amount - 108.9) < 1);
  if (!diff) {
    console.log(balOnly);
    throw new Error("expected ~108.9 from balance diff");
  }

  const payslip = parseUnstructuredText(`
תלוש שכר לחודש 02/2026
שכר ברוטו: 15,000
נטו לתשלום: 11,250.50
`);
  if (payslip.length !== 1 || payslip[0].categoryKey !== "salary") {
    throw new Error(`payslip parse failed: ${JSON.stringify(payslip)}`);
  }
  if (Math.abs(payslip[0].amount - 11250.5) > 0.01) {
    throw new Error(`payslip amount ${payslip[0].amount}`);
  }

  console.log("OK extract parsers", {
    csv: csv.length,
    statement: statement.length,
    payslip: payslip[0].amount,
  });
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
