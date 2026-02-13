import type { ComparisonRecord } from "./db";

export function exportAsHtml(record: ComparisonRecord): string {
  const { fileName1, fileName2, fileType, date, summary, differences } = record;

  const rows = differences
    .map((diff) => {
      const bgColor =
        diff.type === "added"
          ? "#e6ffec"
          : diff.type === "removed"
          ? "#ffebe9"
          : diff.type === "modified"
          ? "#fff8c5"
          : "#ffffff";
      const symbol =
        diff.type === "added"
          ? "+"
          : diff.type === "removed"
          ? "-"
          : diff.type === "modified"
          ? "~"
          : " ";
      return `<tr style="background:${bgColor}">
        <td style="padding:4px 8px;border:1px solid #ddd;color:#666;text-align:center">${diff.lineNumber ?? ""}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">${symbol}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;white-space:pre-wrap">${escapeHtml(diff.content1 ?? "")}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;white-space:pre-wrap">${escapeHtml(diff.content2 ?? "")}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comparison Report - ${escapeHtml(fileName1)} vs ${escapeHtml(fileName2)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #333; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #666; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { padding: 12px 20px; border-radius: 8px; text-align: center; }
    .stat-added { background: #e6ffec; color: #1a7f37; }
    .stat-removed { background: #ffebe9; color: #cf222e; }
    .stat-modified { background: #fff8c5; color: #9a6700; }
    .stat-unchanged { background: #f6f8fa; color: #656d76; }
    .stat strong { display: block; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f6f8fa; padding: 8px; border: 1px solid #ddd; text-align: left; }
  </style>
</head>
<body>
  <h1>Comparison Report</h1>
  <div class="meta">
    <p><strong>File 1:</strong> ${escapeHtml(fileName1)} | <strong>File 2:</strong> ${escapeHtml(fileName2)}</p>
    <p><strong>Type:</strong> ${fileType.toUpperCase()} | <strong>Date:</strong> ${new Date(date).toLocaleString()}</p>
  </div>
  <div class="summary">
    <div class="stat stat-added"><strong>${summary.added}</strong>Added</div>
    <div class="stat stat-removed"><strong>${summary.removed}</strong>Removed</div>
    <div class="stat stat-modified"><strong>${summary.modified}</strong>Modified</div>
    <div class="stat stat-unchanged"><strong>${summary.unchanged}</strong>Unchanged</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:60px">Line</th>
        <th style="width:30px">Op</th>
        <th>File 1</th>
        <th>File 2</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
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
  const header = "Line,Type,File 1 Content,File 2 Content\n";
  const rows = record.differences
    .map(
      (d) =>
        `${d.lineNumber ?? ""},${d.type},"${escapeCsv(d.content1 ?? "")}","${escapeCsv(d.content2 ?? "")}"`
    )
    .join("\n");
  const csv = header + rows;
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
