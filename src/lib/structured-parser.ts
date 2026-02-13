"use client";

export interface ParsedTable {
  section: string;
  headers: string[];
  rows: string[][];
}

export async function parseFileToTables(file: File): Promise<ParsedTable[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return parsePdfToTables(file);
    case "xlsx":
    case "xls":
      return parseExcelToTables(file);
    case "csv":
      return parseCsvToTables(file);
    case "docx":
      return parseWordToTables(file);
    case "txt":
    case "json":
    case "xml":
    case "md":
    case "log":
      return parseTextToTables(file);
    default:
      throw new Error(`Unsupported file type: ${file.name}`);
  }
}

async function parsePdfToTables(file: File): Promise<ParsedTable[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Collect ALL text items across all pages with their positions
  const allItems: { x: number; y: number; width: number; text: string; page: number }[] = [];
  let yOffset = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ti = item as any;
      if (!ti.str || !ti.str.trim()) continue;
      const x = ti.transform[4];
      const y = yOffset + (viewport.height - ti.transform[5]);
      const width = ti.width ?? ti.str.length * 5;
      allItems.push({ x, y, width, text: ti.str.trim(), page: i });
    }

    yOffset += viewport.height + 20;
  }

  if (allItems.length === 0) return [{ section: "Document", headers: ["Content"], rows: [] }];

  // Step 1: Discover column boundaries by clustering X positions
  const columnBoundaries = discoverColumns(allItems);

  // Step 2: Group items into visual rows by Y proximity
  const textRows = groupIntoRows(allItems);

  // Step 3: Assign each item in a visual row to a column
  const rawRows: string[][] = [];
  for (const rowItems of textRows) {
    const cells = assignToColumns(rowItems, columnBoundaries);
    if (cells.some((c) => c.trim())) {
      rawRows.push(cells);
    }
  }

  if (rawRows.length === 0) return [{ section: "Document", headers: ["Content"], rows: [] }];

  // Step 4: Detect header row
  const headers = rawRows[0].map((h, idx) => h || `Column ${idx + 1}`);
  const dataLines = rawRows.slice(1).filter((r) => r.some((c) => c.trim()));

  // Step 5: Find the "Line" column (first column with sequential numbers)
  const lineColIdx = findLineNumberColumn(headers, dataLines);

  // Step 6: Merge multi-line rows (continuation lines belong to previous primary row)
  const mergedRows = mergeMultiLineRows(dataLines, lineColIdx, headers.length);

  // Step 7: Extract sub-fields from Description-like columns (Piece Mark, Punch, Bend A, Bend B, etc.)
  const { headers: finalHeaders, rows: finalRows } = extractSubFields(headers, mergedRows);

  return [{ section: "All Pages", headers: finalHeaders, rows: finalRows }];
}

// Find the column that contains sequential line numbers (1, 2, 3...)
function findLineNumberColumn(headers: string[], rows: string[][]): number {
  // First check header names
  for (let c = 0; c < headers.length; c++) {
    const h = headers[c].toLowerCase().trim();
    if (h === "line" || h === "line#" || h === "line #" || h === "no" || h === "no." || h === "#") {
      return c;
    }
  }

  // Fallback: find the first column where most non-empty values are numbers
  for (let c = 0; c < Math.min(3, headers.length); c++) {
    let numCount = 0;
    let nonEmpty = 0;
    for (const row of rows) {
      const val = (row[c] ?? "").trim();
      if (val) {
        nonEmpty++;
        if (/^\d+$/.test(val)) numCount++;
      }
    }
    if (nonEmpty > 0 && numCount / nonEmpty >= 0.5) return c;
  }

  return -1; // No line number column found
}

// Merge continuation lines into the previous primary row
function mergeMultiLineRows(rows: string[][], lineColIdx: number, numCols: number): string[][] {
  if (lineColIdx < 0) return rows; // No line column detected, can't merge

  const merged: string[][] = [];

  for (const row of rows) {
    const lineVal = (row[lineColIdx] ?? "").trim();
    const isNewRow = /^\d+$/.test(lineVal); // Has a line number = new primary row

    if (isNewRow || merged.length === 0) {
      merged.push([...row]);
    } else {
      // Continuation line: append non-empty cells to the previous row
      const prev = merged[merged.length - 1];
      for (let c = 0; c < numCols; c++) {
        const val = (row[c] ?? "").trim();
        if (val && c !== lineColIdx) {
          prev[c] = prev[c] ? prev[c] + " | " + val : val;
        }
      }
    }
  }

  return merged;
}

// Known sub-field patterns commonly found in PO descriptions
const SUB_FIELD_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "Piece Mark", regex: /Piece\s*Mark[:\s]+([^|]+)/i },
  { label: "Punch", regex: /Punch[:\s]+([^|]+)/i },
  { label: "Bend A", regex: /Bend\s*A[:\s]+([^|]+)/i },
  { label: "Bend B", regex: /Bend\s*B[:\s]+([^|]+)/i },
  { label: "Bend C", regex: /Bend\s*C[:\s]+([^|]+)/i },
  { label: "Finish", regex: /Finish[:\s]+([^|]+)/i },
  { label: "Grade", regex: /Grade[:\s]+([^|]+)/i },
];

// Extract sub-fields from the Description column into their own columns
function extractSubFields(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  // Find the Description column (the widest text column, or one named "Description")
  let descColIdx = headers.findIndex(
    (h) => h.toLowerCase().includes("description")
  );
  if (descColIdx < 0) {
    // Fallback: find the column with the longest average content
    let maxAvgLen = 0;
    for (let c = 0; c < headers.length; c++) {
      const avgLen =
        rows.reduce((sum, r) => sum + (r[c] ?? "").length, 0) / Math.max(rows.length, 1);
      if (avgLen > maxAvgLen) {
        maxAvgLen = avgLen;
        descColIdx = c;
      }
    }
  }

  if (descColIdx < 0) return { headers, rows };

  // Check which sub-fields actually appear in the data
  const activeFields: { label: string; regex: RegExp }[] = [];
  for (const pattern of SUB_FIELD_PATTERNS) {
    const found = rows.some((r) => pattern.regex.test(r[descColIdx] ?? ""));
    if (found) activeFields.push(pattern);
  }

  if (activeFields.length === 0) return { headers, rows };

  // Build new headers: original + extracted sub-field columns
  const newHeaders = [...headers, ...activeFields.map((f) => f.label)];

  // Build new rows: extract sub-fields from description, clean description
  const newRows = rows.map((row) => {
    const desc = row[descColIdx] ?? "";
    const newRow = [...row];

    // Extract each sub-field
    for (const field of activeFields) {
      const match = desc.match(field.regex);
      newRow.push(match ? match[1].trim() : "");
    }

    // Clean the description: remove extracted sub-field text
    let cleanDesc = desc;
    for (const field of activeFields) {
      // Remove "Label: Value" patterns and surrounding pipes
      cleanDesc = cleanDesc.replace(
        new RegExp(`\\|?\\s*${field.regex.source}`, "i"),
        ""
      );
    }
    // Clean up leftover pipes and whitespace
    cleanDesc = cleanDesc.replace(/\|\s*\|/g, "|").replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim();
    newRow[descColIdx] = cleanDesc;

    return newRow;
  });

  return { headers: newHeaders, rows: newRows };
}

// Cluster X positions to find column boundaries
function discoverColumns(items: { x: number; width: number }[]): number[] {
  const xPositions = items.map((i) => Math.round(i.x));
  xPositions.sort((a, b) => a - b);

  const clusters: number[][] = [];
  let currentCluster: number[] = [xPositions[0]];

  for (let i = 1; i < xPositions.length; i++) {
    if (xPositions[i] - xPositions[i - 1] <= 8) {
      currentCluster.push(xPositions[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [xPositions[i]];
    }
  }
  clusters.push(currentCluster);

  const significantClusters = clusters.filter((c) => c.length >= 3);

  if (significantClusters.length <= 1) {
    const fallback = clusters.filter((c) => c.length >= 2);
    if (fallback.length <= 1) {
      return [Math.min(...xPositions)];
    }
    return fallback.map((c) => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
  }

  return significantClusters.map((c) =>
    Math.round(c.reduce((a, b) => a + b, 0) / c.length)
  );
}

// Group items into rows by Y proximity
function groupIntoRows(
  items: { x: number; y: number; width: number; text: string }[]
): { x: number; y: number; width: number; text: string }[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: { x: number; y: number; width: number; text: string }[][] = [];
  let currentRow: typeof sorted = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= 4) {
      currentRow.push(sorted[i]);
    } else {
      rows.push(currentRow);
      currentRow = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  rows.push(currentRow);

  return rows;
}

// Assign row items to the nearest column
function assignToColumns(
  rowItems: { x: number; text: string }[],
  columnBoundaries: number[]
): string[] {
  const cells: string[] = new Array(columnBoundaries.length).fill("");

  for (const item of rowItems) {
    let bestCol = 0;
    let bestDist = Math.abs(item.x - columnBoundaries[0]);
    for (let c = 1; c < columnBoundaries.length; c++) {
      const dist = Math.abs(item.x - columnBoundaries[c]);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = c;
      }
    }
    cells[bestCol] = cells[bestCol]
      ? cells[bestCol] + " " + item.text
      : item.text;
  }

  return cells;
}

async function parseExcelToTables(file: File): Promise<ParsedTable[]> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const tables: ParsedTable[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (data.length === 0) continue;

    const firstRow = (data[0] as string[]).map((c, idx) =>
      c ? String(c) : `Column ${idx + 1}`
    );
    const maxCols = Math.max(firstRow.length, ...data.map((r) => (r as string[]).length));

    const headers = firstRow;
    while (headers.length < maxCols) headers.push(`Column ${headers.length + 1}`);

    const rows = data.slice(1).map((row) => {
      const r = (row as string[]).map((cell) => String(cell ?? ""));
      while (r.length < maxCols) r.push("");
      return r;
    });

    tables.push({ section: sheetName, headers, rows });
  }

  return tables;
}

async function parseCsvToTables(file: File): Promise<ParsedTable[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Detect delimiter
  const comma = (lines[0].match(/,/g) || []).length;
  const tab = (lines[0].match(/\t/g) || []).length;
  const semi = (lines[0].match(/;/g) || []).length;
  const delimiter = tab > comma && tab > semi ? "\t" : semi > comma ? ";" : ",";

  const parsed = lines.map((line) => parseCsvLine(line, delimiter));
  const headers = parsed[0].map((h, idx) => h || `Column ${idx + 1}`);
  const rows = parsed.slice(1);

  return [{ section: "CSV Data", headers, rows }];
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function parseWordToTables(file: File): Promise<ParsedTable[]> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const lines = result.value.split(/\r?\n/).filter((l: string) => l.trim());

  // Try to detect tabular structure
  const tabLines = lines.filter((l: string) => l.includes("\t"));
  if (tabLines.length > lines.length * 0.3) {
    // Looks tabular
    const parsed = lines.map((l: string) => l.split("\t").map((c: string) => c.trim()));
    const maxCols = Math.max(...parsed.map((r: string[]) => r.length));
    const headers = parsed[0].map((h: string, idx: number) => h || `Column ${idx + 1}`);
    while (headers.length < maxCols) headers.push(`Column ${headers.length + 1}`);
    const rows = parsed.slice(1).map((r: string[]) => {
      while (r.length < maxCols) r.push("");
      return r;
    });
    return [{ section: "Document", headers, rows }];
  }

  // Fallback: each line is a row
  const rows = lines.map((l: string) => [l]);
  return [{ section: "Document", headers: ["Content"], rows }];
}

async function parseTextToTables(file: File): Promise<ParsedTable[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Check if tab-separated or has consistent delimiters
  const tabCount = lines.filter((l) => l.includes("\t")).length;
  if (tabCount > lines.length * 0.3) {
    const parsed = lines.map((l) => l.split("\t").map((c) => c.trim()));
    const maxCols = Math.max(...parsed.map((r) => r.length));
    const headers = parsed[0].map((h, idx) => h || `Column ${idx + 1}`);
    while (headers.length < maxCols) headers.push(`Column ${headers.length + 1}`);
    const rows = parsed.slice(1).map((r) => {
      while (r.length < maxCols) r.push("");
      return r;
    });
    return [{ section: "Text Data", headers, rows }];
  }

  // Key-value detection (e.g., "Label: Value")
  const kvLines = lines.filter((l) => /^[^:]+:\s*.+/.test(l));
  if (kvLines.length > lines.length * 0.4) {
    const rows = lines.map((l) => {
      const match = l.match(/^([^:]+):\s*(.+)/);
      return match ? [match[1].trim(), match[2].trim()] : ["", l];
    });
    return [{ section: "Text Data", headers: ["Field", "Value"], rows }];
  }

  // Fallback: line-by-line
  const rows = lines.map((l, idx) => [String(idx + 1), l]);
  return [{ section: "Text Data", headers: ["Line", "Content"], rows }];
}
