import type { ComparisonRecord, ComparedRow } from "./db";

function buildSection(title: string, rows: ComparedRow[], headers: string[], mode: "both" | "file1" | "file2" | "identical"): string {
  if (rows.length === 0) return "";

  let tableRows = "";

  if (mode === "both") {
    // Modified rows: show field, file1 value, file2 value
    for (const row of rows) {
      const changedCells = row.cells.filter((c) => c.changed);
      const unchangedCells = row.cells.filter((c) => !c.changed);
      for (const cell of changedCells) {
        tableRows += `<tr style="background:#fff8c5">
          <td class="cell">${escapeHtml(cell.header)}</td>
          <td class="cell" style="color:#cf222e;background:#ffebe9">${escapeHtml(cell.value1 || "—")}</td>
          <td class="cell" style="color:#1a7f37;background:#e6ffec">${escapeHtml(cell.value2 || "—")}</td>
        </tr>`;
      }
      if (unchangedCells.length > 0) {
        tableRows += `<tr style="background:#f6f8fa">
          <td class="cell" colspan="3" style="color:#666;font-style:italic">+ ${unchangedCells.length} matching field${unchangedCells.length !== 1 ? "s" : ""}: ${unchangedCells.map((c) => c.header).join(", ")}</td>
        </tr>`;
      }
      tableRows += `<tr><td colspan="3" style="height:4px;border:none"></td></tr>`;
    }

    return `<div class="section">
      <h2 class="section-title" style="color:#9a6700">${title} (${rows.length})</h2>
      <table><thead><tr><th class="cell">Field</th><th class="cell">File 1 Value</th><th class="cell">File 2 Value</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div>`;
  }

  // Simple table for added/removed/identical
  const headerRow = headers.map((h) => `<th class="cell">${escapeHtml(h)}</th>`).join("");
  for (const row of rows) {
    const bgColor = mode === "file2" ? "#e6ffec" : mode === "file1" ? "#ffebe9" : "#fff";
    const cells = row.cells
      .map((c) => {
        const val = mode === "file2" ? c.value2 : c.value1;
        return `<td class="cell">${escapeHtml(val || "—")}</td>`;
      })
      .join("");
    tableRows += `<tr style="background:${bgColor}">${cells}</tr>`;
  }

  const titleColor = mode === "file2" ? "#1a7f37" : mode === "file1" ? "#cf222e" : "#333";
  return `<div class="section">
    <h2 class="section-title" style="color:${titleColor}">${title} (${rows.length})</h2>
    <table><thead><tr>${headerRow}</tr></thead>
    <tbody>${tableRows}</tbody></table></div>`;
}

export function exportAsHtml(record: ComparisonRecord): string {
  const { fileName1, fileName2, fileType, date, summary, rows, headers } = record;

  const modified = rows.filter((r) => r.status === "modified");
  const added = rows.filter((r) => r.status === "added");
  const removed = rows.filter((r) => r.status === "removed");
  const identical = rows.filter((r) => r.status === "identical");

  const sections = [
    buildSection("Differences", modified, headers, "both"),
    buildSection(`Only in ${fileName2}`, added, headers, "file2"),
    buildSection(`Only in ${fileName1}`, removed, headers, "file1"),
    buildSection("Matching Data", identical, headers, "identical"),
  ].join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comparison Report - ${escapeHtml(fileName1)} vs ${escapeHtml(fileName2)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #333; max-width: 1200px; margin: 40px auto; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #666; margin-bottom: 24px; font-size: 14px; }
    .summary { display: flex; gap: 16px; margin-bottom: 32px; }
    .stat { padding: 16px 24px; border-radius: 12px; text-align: center; min-width: 100px; }
    .stat-score { background: ${summary.matchScore >= 80 ? "#e6ffec" : summary.matchScore >= 50 ? "#fff8c5" : "#ffebe9"}; }
    .stat-identical { background: #e6ffec; color: #1a7f37; }
    .stat-modified { background: #fff8c5; color: #9a6700; }
    .stat-added { background: #ddf4ff; color: #0969da; }
    .stat-removed { background: #ffebe9; color: #cf222e; }
    .stat strong { display: block; font-size: 28px; margin-bottom: 4px; }
    .stat span { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 18px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
    .cell { padding: 8px 12px; border: 1px solid #e1e4e8; text-align: left; }
    th.cell { background: #f6f8fa; font-weight: 600; }
    .files { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; padding: 16px; background: #f6f8fa; border-radius: 8px; }
    .files p { margin: 0; font-size: 13px; }
    .files .label { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    @media print { body { margin: 20px; } .summary { gap: 8px; } }
  </style>
</head>
<body>
  <h1>Comparison Report</h1>
  <div class="meta">
    <p>${fileType.toUpperCase()} comparison &middot; ${new Date(date).toLocaleString()}</p>
  </div>

  <div class="files">
    <div><p class="label">File 1 (Original)</p><p><strong>${escapeHtml(fileName1)}</strong></p></div>
    <div><p class="label">File 2 (Modified)</p><p><strong>${escapeHtml(fileName2)}</strong></p></div>
  </div>

  <div class="summary">
    <div class="stat stat-score"><strong>${summary.matchScore}%</strong><span>Match</span></div>
    <div class="stat stat-identical"><strong>${summary.identical}</strong><span>Identical</span></div>
    <div class="stat stat-modified"><strong>${summary.modified}</strong><span>Modified</span></div>
    <div class="stat stat-added"><strong>${summary.added}</strong><span>Added</span></div>
    <div class="stat stat-removed"><strong>${summary.removed}</strong><span>Removed</span></div>
  </div>

  ${sections}
</body>
</html>`;
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
  const { headers, rows } = record;
  const csvHeaders = ["Row #", "Status", ...headers.flatMap((h) => [`${h} (File 1)`, `${h} (File 2)`])];
  const headerLine = csvHeaders.map((h) => `"${escapeCsv(h)}"`).join(",");

  const csvRows = rows.map((row) => {
    const cells = [String(row.rowIndex), row.status];
    for (const cell of row.cells) {
      cells.push(cell.value1 || "");
      cells.push(cell.value2 || "");
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCsv(str: string): string {
  return str.replace(/"/g, '""');
}
