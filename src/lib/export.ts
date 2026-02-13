import type { ComparisonRecord } from "./db";

export function exportAsHtml(record: ComparisonRecord): string {
  const { fileNames, fileLabels, fileType, date, summary, rows, headers, keyColumn } = record;
  const labels = fileLabels.length > 0 ? fileLabels : fileNames.map((_, i) => `File ${String.fromCharCode(65 + i)}`);

  const modified = rows.filter((r) => r.status === "modified");
  const missing = rows.filter((r) => r.status === "missing");
  const identical = rows.filter((r) => r.status === "identical");

  // Discrepancies section
  let discrepancyHtml = "";
  if (modified.length > 0) {
    const fileHeaders = labels.map((l) => `<th class="cell">${esc(l)}</th>`).join("");
    let tbody = "";
    for (const row of modified) {
      const changedCells = row.cells.filter((c) => {
        const vals = c.values.filter((v) => v !== undefined) as string[];
        return vals.length > 1 && !vals.every((v) => v === vals[0]);
      });
      for (const cell of changedCells) {
        const valueCells = cell.values.map((v) =>
          `<td class="cell" style="font-family:monospace">${esc(v ?? "—")}</td>`
        ).join("");
        tbody += `<tr><td class="cell"><strong>${esc(row.keyValue)}</strong></td><td class="cell">${esc(cell.header)}</td>${valueCells}</tr>`;
      }
    }
    discrepancyHtml = `<div class="section">
      <h2 class="section-title" style="color:#9a6700">Discrepancies (${modified.length} items)</h2>
      <table><thead><tr><th class="cell">Item</th><th class="cell">Field</th>${fileHeaders}</tr></thead>
      <tbody>${tbody}</tbody></table></div>`;
  }

  // Missing sections (grouped by file)
  let missingHtml = "";
  for (let f = 0; f < fileNames.length; f++) {
    const missingFromF = missing.filter((r) => r.missingFrom.includes(f));
    if (missingFromF.length === 0) continue;
    let tbody = "";
    for (const row of missingFromF) {
      const foundIn = row.presentIn.map((i) => labels[i]).join(", ");
      const details = row.cells.filter((c) => c.values.some((v) => v)).slice(0, 4)
        .map((c) => `${c.header}: ${c.values.find((v) => v)}`).join(" | ");
      tbody += `<tr><td class="cell"><strong>${esc(row.keyValue)}</strong></td><td class="cell">${esc(foundIn)}</td><td class="cell" style="font-family:monospace;color:#666">${esc(details)}</td></tr>`;
    }
    missingHtml += `<div class="section">
      <h2 class="section-title" style="color:#cf222e">Missing from ${esc(labels[f])} (${missingFromF.length})</h2>
      <table><thead><tr><th class="cell">Item</th><th class="cell">Found In</th><th class="cell">Details</th></tr></thead>
      <tbody>${tbody}</tbody></table></div>`;
  }

  // Matching section
  let matchingHtml = "";
  if (identical.length > 0) {
    const headerRow = headers.map((h) => `<th class="cell">${esc(h)}</th>`).join("");
    let tbody = "";
    for (const row of identical) {
      const cells = row.cells.map((c) => `<td class="cell">${esc(c.values.find((v) => v) ?? "—")}</td>`).join("");
      tbody += `<tr>${cells}</tr>`;
    }
    matchingHtml = `<div class="section">
      <h2 class="section-title" style="color:#1a7f37">Matching (${identical.length})</h2>
      <table><thead><tr>${headerRow}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }

  // Files list
  const filesHtml = fileNames.map((name, i) =>
    `<div><p class="label">${esc(labels[i])}</p><p><strong>${esc(name)}</strong></p>${summary.missingPerFile[i] > 0 ? `<p style="color:#cf222e;font-size:11px">${summary.missingPerFile[i]} items missing</p>` : ""}</div>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comparison Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; max-width: 1200px; margin: 40px auto; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #666; margin-bottom: 24px; font-size: 14px; }
    .summary { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .stat { padding: 16px 24px; border-radius: 12px; text-align: center; min-width: 100px; }
    .stat-score { background: ${summary.matchScore >= 80 ? "#e6ffec" : summary.matchScore >= 50 ? "#fff8c5" : "#ffebe9"}; }
    .stat-identical { background: #e6ffec; color: #1a7f37; }
    .stat-modified { background: #fff8c5; color: #9a6700; }
    .stat-missing { background: #ffebe9; color: #cf222e; }
    .stat strong { display: block; font-size: 28px; margin-bottom: 4px; }
    .stat span { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 18px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
    .cell { padding: 8px 12px; border: 1px solid #e1e4e8; text-align: left; }
    th.cell { background: #f6f8fa; font-weight: 600; }
    .files { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; padding: 16px; background: #f6f8fa; border-radius: 8px; }
    .files > div { min-width: 150px; }
    .files p { margin: 0; font-size: 13px; }
    .files .label { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>Comparison Report</h1>
  <div class="meta">
    <p>${fileType.toUpperCase()} comparison &middot; ${new Date(date).toLocaleString()} &middot; Key column: <strong>${esc(keyColumn)}</strong></p>
  </div>

  <div class="files">${filesHtml}</div>

  <div class="summary">
    <div class="stat stat-score"><strong>${summary.matchScore}%</strong><span>Match</span></div>
    <div class="stat stat-identical"><strong>${summary.identical}</strong><span>Matching</span></div>
    <div class="stat stat-modified"><strong>${summary.modified}</strong><span>Discrepancies</span></div>
    <div class="stat stat-missing"><strong>${summary.missing}</strong><span>Missing</span></div>
  </div>

  ${discrepancyHtml}
  ${missingHtml}
  ${matchingHtml}
</body>
</html>`;
}

export function downloadPdf(record: ComparisonRecord) {
  const html = exportAsHtml(record);
  // Use an iframe + window.print() to avoid html2canvas "lab" color issues
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.width = "1200px";
  iframe.style.height = "800px";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for content to render, then trigger print (Save as PDF)
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.print();
      // Clean up after print dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };
}

export function downloadReport(record: ComparisonRecord) {
  const html = exportAsHtml(record);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comparison-report-${record.id}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(record: ComparisonRecord) {
  const { headers, rows, fileNames, fileLabels } = record;
  const labels = fileLabels.length > 0 ? fileLabels : fileNames.map((_, i) => `File ${String.fromCharCode(65 + i)}`);

  const csvHeaders = ["Item Key", "Status", "Present In", "Missing From",
    ...headers.flatMap((h) => labels.map((l) => `${h} (${l})`))];
  const headerLine = csvHeaders.map((h) => `"${escapeCsv(h)}"`).join(",");

  const csvRows = rows.map((row) => {
    const presentIn = row.presentIn.map((f) => labels[f]).join("; ");
    const missingFrom = row.missingFrom.map((f) => labels[f]).join("; ");
    const cells: string[] = [row.keyValue, row.status, presentIn, missingFrom];
    for (const cell of row.cells) {
      for (let f = 0; f < fileNames.length; f++) {
        cells.push(cell.values[f] ?? "");
      }
    }
    return cells.map((c) => `"${escapeCsv(c)}"`).join(",");
  });

  const csv = [headerLine, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comparison-report-${record.id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCsv(str: string): string {
  return str.replace(/"/g, '""');
}
