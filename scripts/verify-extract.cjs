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
    stitchStatementLines,
    detectKind,
    parseTabularTransactions,
  } = require("../services/api/src/documents/extract.ts");
  const {
    clusterTextItemsToLines,
    extractPdfText,
  } = require("../services/api/src/documents/extract-pdf.ts");

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

  // Balance + amount columns (typical after PDF row clustering)
  const balOnly = parseUnstructuredText(`
28/06/2026 משיכת מזומן 108.90 25094.86
28/06/2026 כרטיס דביט 108.90 24985.96
`);
  if (balOnly.length < 1) throw new Error("balance-diff expected rows");
  const diff = balOnly.find((r) => Math.abs(r.amount - 108.9) < 1);
  if (!diff) {
    console.log(balOnly);
    throw new Error("expected ~108.9 from amount column");
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

  const stitched = stitchStatementLines(`
דף חשבון
15/01/2026
סופר רמי לוי
120.50
15,240.40
16/01/2026
פז תדלוק
210.00
15,030.40
`);
  if (!stitched.includes("15/01/2026 סופר רמי לוי 120.50 15,240.40")) {
    throw new Error(`stitch failed: ${stitched}`);
  }
  const fromStitch = parseUnstructuredText(stitched);
  if (fromStitch.length < 2) {
    throw new Error(`stitched statement expected >=2 got ${fromStitch.length}`);
  }

  const clustered = clusterTextItemsToLines([
    { str: "15/01/2026", x: 400, y: 700 },
    { str: "רמי לוי", x: 220, y: 701 },
    { str: "120.50", x: 90, y: 699 },
    { str: "15,240.40", x: 10, y: 700 },
    { str: "16/01/2026", x: 400, y: 680 },
    { str: "פז", x: 220, y: 680 },
    { str: "210.00", x: 90, y: 681 },
    { str: "15,030.40", x: 10, y: 680 },
  ]);
  if (clustered.length !== 2 || !/15\/01\/2026/.test(clustered[0])) {
    throw new Error(`cluster failed: ${JSON.stringify(clustered)}`);
  }
  const fromCluster = parseUnstructuredText(clustered.join("\n"));
  if (fromCluster.length < 2) {
    throw new Error(`clustered statement expected >=2 got ${fromCluster.length}`);
  }

  function pdfWithText(s) {
    const stream = "BT /F1 12 Tf 24 120 Td (" + s + ") Tj ET";
    const objs = [
      "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
      "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
      "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
      "4 0 obj<< /Length " + stream.length + " >>stream\n" + stream + "\nendstream\nendobj\n",
      "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    ];
    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (const o of objs) {
      offsets.push(Buffer.byteLength(body, "latin1"));
      body += o;
    }
    const xrefStart = Buffer.byteLength(body, "latin1");
    body += "xref\n0 6\n0000000000 65535 f \n";
    for (let i = 1; i <= 5; i++) {
      body += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    body += "trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";
    return Buffer.from(body, "latin1");
  }
  const pdfText = await extractPdfText(
    pdfWithText("15/01/2026 Super 120.50 15240.40"),
  );
  if (!/15\/01\/2026/.test(pdfText)) {
    throw new Error(`pdf extract missed date: ${pdfText}`);
  }
  const fromPdf = parseUnstructuredText(pdfText);
  if (!fromPdf.some((r) => Math.abs(r.amount - 120.5) < 0.01)) {
    throw new Error(`pdf extract parse failed: ${JSON.stringify(fromPdf)}`);
  }

  const {
    parseExcelTransactions,
    extractExcel,
    excelSerialToDate,
  } = require("../services/api/src/documents/extract-xlsx.ts");
  const XLSX = require("xlsx");

  const csvMime = Buffer.from(
    "date,amount,description\n2026-03-01,50,פז\n",
    "utf8",
  );
  if (detectKind("export.xls", "application/vnd.ms-excel", csvMime) !== "csv") {
    throw new Error("vnd.ms-excel + CSV body should stay CSV");
  }
  if (detectKind("statement.xlsx", "application/octet-stream") !== "xlsx") {
    throw new Error("xlsx extension should detect spreadsheet");
  }
  if (
    detectKind(
      "file",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ) !== "xlsx"
  ) {
    throw new Error("spreadsheetml MIME should detect spreadsheet");
  }
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (detectKind("old.xls", "application/vnd.ms-excel", ole) !== "xlsx") {
    throw new Error(".xls OLE should detect spreadsheet");
  }

  function workbookToBuffer(aoaSheets) {
    const wb = XLSX.utils.book_new();
    for (const { name, rows, dates } of aoaSheets) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (dates) {
        for (const { addr, serial } of dates) {
          ws[addr] = { t: "n", v: serial, z: "yyyy-mm-dd" };
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  const hebrewExcel = workbookToBuffer([
    {
      name: "סיכום",
      rows: [
        ["יתרה", "1000"],
        ["עודכן", "01/03/2026"],
      ],
    },
    {
      name: "תנועות",
      rows: [
        ["בנק הפועלים — דף חשבון"],
        ["לתקופה 01/03/2026 - 31/03/2026"],
        ["תאריך", "תיאור פעולה", "חובה", "זכות", "יתרה"],
        ["01/03/2026", "פז תדלוק", 210.5, "", 14800],
        ["02/03/2026", "משכורת", "", 12000, 26800],
        ["03/03/2026", "סה״כ", 210.5, 12000, 26800],
      ],
    },
  ]);
  if (detectKind("bank.xlsx", "application/octet-stream", hebrewExcel) !== "xlsx") {
    throw new Error("xlsx magic/ext should detect spreadsheet");
  }
  const excelRows = parseExcelTransactions(hebrewExcel);
  if (excelRows.length !== 2) {
    throw new Error(`excel hebrew expected 2 rows got ${excelRows.length} ${JSON.stringify(excelRows)}`);
  }
  const paz = excelRows.find((r) => /פז/.test(r.description));
  const salary = excelRows.find((r) => /משכורת/.test(r.description));
  if (!paz || Math.abs(paz.amount - 210.5) > 0.01) {
    throw new Error(`excel debit amount: ${JSON.stringify(paz)}`);
  }
  if (paz.direction !== "EXPENSE") {
    throw new Error(`excel debit should be expense, got ${paz.direction}`);
  }
  if (!salary || Math.abs(salary.amount - 12000) > 0.01) {
    throw new Error(`excel credit amount: ${JSON.stringify(salary)}`);
  }
  if (salary.direction !== "INCOME") {
    throw new Error(`excel credit should be income, got ${salary.direction}`);
  }

  const serial = Math.round(
    (Date.UTC(2026, 2, 12) - Date.UTC(1899, 11, 30)) / 86400000,
  );
  const serialDate = excelSerialToDate(serial);
  if (!serialDate || serialDate.getFullYear() !== 2026 || serialDate.getMonth() !== 2 || serialDate.getDate() !== 12) {
    throw new Error(`excel serial date failed: ${serial} -> ${serialDate}`);
  }
  const serialExcel = workbookToBuffer([
    {
      name: "Sheet1",
      rows: [
        ["תאריך", "סכום", "תיאור"],
        [null, 88.2, "סופר"],
      ],
      dates: [{ addr: "A2", serial }],
    },
  ]);
  const serialRows = parseExcelTransactions(serialExcel);
  if (serialRows.length !== 1) {
    throw new Error(`serial excel expected 1 got ${serialRows.length}`);
  }
  if (!serialRows[0].bookedAt.startsWith("2026-03-12")) {
    throw new Error(`serial excel date ${serialRows[0].bookedAt}`);
  }
  if (Math.abs(serialRows[0].amount - 88.2) > 0.01) {
    throw new Error(`serial excel amount ${serialRows[0].amount}`);
  }

  const titledCsv = parseTabularTransactions([
    ["דף חשבון כאל"],
    ["תאריך עסקה", "שם בית עסק", "סכום"],
    ["12/03/2026", "רמי לוי", "95.4"],
  ]);
  if (titledCsv.length !== 1 || Math.abs(titledCsv[0].amount - 95.4) > 0.01) {
    throw new Error(`titled table failed: ${JSON.stringify(titledCsv)}`);
  }

  const extracted = extractExcel(hebrewExcel);
  if (!extracted.text.includes("תיאור פעולה") || extracted.draft.length !== 2) {
    throw new Error("extractExcel preview/draft mismatch");
  }

  console.log("OK extract parsers", {
    csv: csv.length,
    statement: statement.length,
    payslip: payslip[0].amount,
    stitched: fromStitch.length,
    clustered: fromCluster.length,
    pdf: fromPdf.length,
    excel: excelRows.length,
    serialExcel: serialRows.length,
  });
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
