/** Create a tiny text PDF and upload through the API. */
const API = process.env.API_URL || "http://localhost:3001/api";

function minimalPdf(textLines) {
  // Very small PDF with Helvetica text lines
  const lines = textLines;
  let content = "BT /F1 10 Tf 40 700 Td 14 TL\n";
  for (let i = 0; i < lines.length; i++) {
    const safe = lines[i].replace(/[()\\]/g, " ");
    if (i === 0) content += `(${safe}) Tj\n`;
    else content += `T* (${safe}) Tj\n`;
  }
  content += "ET";
  const objects = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(content)} >>stream\n${content}\nendstream\nendobj\n`,
  );
  objects.push(
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf);
}

async function req(path, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) {
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
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const email = `pdf_${Date.now()}@test.local`;
  const auth = await req("/auth/register", {
    method: "POST",
    body: { email, password: "TestPass123!", displayName: "PDF Test" },
  });
  const token = auth.accessToken;

  const pdfBuf = minimalPdf([
    "Account statement",
    "15/01/2026 Super Market 152.40",
    "16/01/2026 Gas Station 210.00",
    "Net pay: 11250.50",
    "Payslip salary N/A",
  ]);

  // Also test payslip-like text PDF
  const payslipPdf = minimalPdf([
    "Payslip February 2026",
    "Net pay: 9876.50",
    "salary payslip",
  ]);

  for (const [name, buf, expectMin] of [
    ["statement.pdf", pdfBuf, 1],
    ["payslip.pdf", payslipPdf, 1],
  ]) {
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "application/pdf" }), name);
    fd.append("storageMode", "TEMPORARY");
    const uploaded = await req("/documents/upload", {
      method: "POST",
      token,
      formData: fd,
    });
    if (!uploaded.draft || uploaded.draft.length < expectMin) {
      throw new Error(
        `${name}: expected draft >=${expectMin}, got ${JSON.stringify(uploaded)}`,
      );
    }
    if (uploaded.sourceKind !== "pdf") {
      throw new Error(`${name}: sourceKind ${uploaded.sourceKind}`);
    }
    console.log(`OK ${name} rows=${uploaded.draft.length}`, uploaded.draft[0]);
  }

  console.log("OK pdf upload extract");
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
