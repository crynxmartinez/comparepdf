import type { ComparisonRecord, ComparedRow } from "./db";

// ─── Shared helpers ───

function getChangedCells(row: ComparedRow) {
  return row.cells.filter((c) => {
    const vals = c.values.filter((v) => v !== undefined) as string[];
    return vals.length > 1 && !vals.every((v) => v === vals[0]);
  });
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── HTML Export (used by both HTML download and PDF print) ───

export function exportAsHtml(record: ComparisonRecord): string {
  const { fileNames, fileLabels, fileType, date, summary, rows, headers, keyColumn } = record;
  const labels = fileLabels.length > 0 ? fileLabels : fileNames.map((_, i) => `File ${String.fromCharCode(65 + i)}`);

  const modified = rows.filter((r) => r.status === "modified");
  const missing = rows.filter((r) => r.status === "missing");
  const identical = rows.filter((r) => r.status === "identical");

  // Discrepancies — matches on-screen: Item | Field | File A | File B ...
  // Each changed cell is its own row, with "X matching fields" summary row
  let discrepancyHtml = "";
  if (modified.length > 0) {
    const fileHeaders = labels.map((l) => `<th class="cell">${esc(l)}</th>`).join("");
    let tbody = "";
    let lastKey = "";
    for (const row of modified) {
      const changedCells = getChangedCells(row);
      const matchCount = row.cells.length - changedCells.length;
      const isNewItem = row.keyValue !== lastKey;
      lastKey = row.keyValue;
      for (let ci = 0; ci < changedCells.length; ci++) {
        const cell = changedCells[ci];
        const valueCells = cell.values.map((v) => {
          const isDiff = v !== undefined && cell.values.some((ov, j) => j !== cell.values.indexOf(v) && ov !== undefined && ov !== v);
          return `<td class="cell val${isDiff ? " diff" : ""}">${esc(v ?? "—")}</td>`;
        }).join("");
        const itemCell = ci === 0
          ? `<td class="cell item" rowspan="${changedCells.length + (matchCount > 0 ? 1 : 0)}">${isNewItem ? `<strong>${esc(row.keyValue)}</strong>` : ""}</td>`
          : "";
        tbody += `<tr${ci === 0 && isNewItem ? ' class="border-top"' : ""}>${itemCell}<td class="cell field">${esc(cell.header)}</td>${valueCells}</tr>`;
      }
      if (matchCount > 0) {
        tbody += `<tr class="match-row"><td class="cell match-info" colspan="${labels.length + 1}">${matchCount} matching field${matchCount !== 1 ? "s" : ""}</td></tr>`;
      }
    }
    discrepancyHtml = `<div class="section">
      <h2 class="section-title disc-title">Discrepancies <span class="badge disc-badge">${modified.length}</span></h2>
      <p class="section-sub">${modified.length} items have different values across files</p>
      <table><thead><tr><th class="cell">Item</th><th class="cell">Field</th>${fileHeaders}</tr></thead>
      <tbody>${tbody}</tbody></table></div>`;
  }

  // Missing — grouped by file, matches on-screen: Item | Found In | Details
  let missingHtml = "";
  for (let f = 0; f < fileNames.length; f++) {
    const missingFromF = missing.filter((r) => r.missingFrom.includes(f));
    if (missingFromF.length === 0) continue;
    let tbody = "";
    for (const row of missingFromF) {
      const foundIn = row.presentIn.map((i) => labels[i]).join(", ");
      const details = row.cells.filter((c) => c.values.some((v) => v)).slice(0, 4)
        .map((c) => `${c.header}: ${c.values.find((v) => v)}`).join(" | ");
      tbody += `<tr><td class="cell item"><strong>${esc(row.keyValue)}</strong></td><td class="cell">${esc(foundIn)}</td><td class="cell val">${esc(details)}</td></tr>`;
    }
    missingHtml += `<div class="section">
      <h2 class="section-title miss-title">Missing from ${esc(labels[f])} <span class="badge miss-badge">${missingFromF.length}</span></h2>
      <p class="section-sub">${missingFromF.length} items not found in this file</p>
      <table><thead><tr><th class="cell">Item</th><th class="cell">Found In</th><th class="cell">Details</th></tr></thead>
      <tbody>${tbody}</tbody></table></div>`;
  }

  // Matching — matches on-screen: # | all headers
  let matchingHtml = "";
  if (identical.length > 0) {
    const headerRow = `<th class="cell">#</th>` + headers.map((h) => `<th class="cell">${esc(h)}</th>`).join("");
    let tbody = "";
    for (let i = 0; i < identical.length; i++) {
      const row = identical[i];
      const cells = row.cells.map((c) => `<td class="cell val">${esc(c.values.find((v) => v) ?? "—")}</td>`).join("");
      tbody += `<tr><td class="cell" style="color:#999">${i + 1}</td>${cells}</tr>`;
    }
    matchingHtml = `<div class="section">
      <h2 class="section-title match-title">Matching <span class="badge match-badge">${identical.length}</span></h2>
      <p class="section-sub">${identical.length} items are the same across all files</p>
      <table><thead><tr>${headerRow}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }

  // Files info
  const filesHtml = fileNames.map((name, i) =>
    `<div class="file-card"><p class="label">${esc(labels[i])}</p><p class="fname">${esc(name)}</p>${summary.missingPerFile[i] > 0 ? `<p class="file-missing">${summary.missingPerFile[i]} missing</p>` : ""}</div>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comparison Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #666; margin-bottom: 20px; font-size: 13px; }
    .meta p { margin: 0; }

    .files { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; padding: 14px 18px; background: #f8f9fa; border: 1px solid #e8e8e8; border-radius: 8px; }
    .file-card { min-width: 140px; }
    .file-card .label { margin: 0; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .file-card .fname { margin: 2px 0 0; font-size: 12px; font-weight: 600; }
    .file-card .file-missing { margin: 2px 0 0; font-size: 10px; color: #cf222e; }

    .summary { display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
    .stat { padding: 14px 20px; border-radius: 10px; text-align: center; min-width: 90px; }
    .stat-score { background: ${summary.matchScore >= 80 ? "#e6ffec" : summary.matchScore >= 50 ? "#fff8c5" : "#ffebe9"}; }
    .stat-identical { background: #e6ffec; color: #1a7f37; }
    .stat-modified { background: #fff8c5; color: #9a6700; }
    .stat-missing { background: #ffebe9; color: #cf222e; }
    .stat strong { display: block; font-size: 26px; margin-bottom: 2px; }
    .stat span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

    .section { margin-bottom: 28px; border: 1px solid #e8e8e8; border-radius: 8px; overflow: hidden; }
    .section-title { font-size: 15px; margin: 0; padding: 14px 18px 0; }
    .section-sub { font-size: 12px; color: #888; margin: 2px 0 0; padding: 0 18px 12px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 8px; }
    .disc-title { color: #9a6700; } .disc-badge { background: #fff8c5; color: #9a6700; }
    .miss-title { color: #cf222e; } .miss-badge { background: #ffebe9; color: #cf222e; }
    .match-title { color: #1a7f37; } .match-badge { background: #e6ffec; color: #1a7f37; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .cell { padding: 7px 12px; border-bottom: 1px solid #eee; text-align: left; }
    th.cell { background: #f8f9fa; font-weight: 600; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #ddd; }
    .item { font-size: 12px; vertical-align: top; }
    .field { font-size: 12px; font-weight: 500; }
    .val { font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; font-size: 11px; }
    .diff { background: #fff8c5; color: #9a6700; border-radius: 4px; padding: 3px 8px; }
    .match-row { background: #fafafa; }
    .match-info { color: #999; font-size: 11px; font-style: italic; }
    tr.border-top td { border-top: 1px solid #ddd; }

    @media print {
      body { margin: 10px; padding: 10px; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Comparison Report</h1>
  <div class="meta">
    <p>${fileType.toUpperCase()} comparison &middot; ${new Date(date).toLocaleString()} &middot; Key: <strong>${esc(keyColumn)}</strong></p>
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

// ─── HTML Download ───

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

