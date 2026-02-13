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

  type TextItem = { x: number; y: number; width: number; text: string };

  // Process each page separately to handle repeated headers
  const pageItemSets: TextItem[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    const items: TextItem[] = [];
    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ti = item as any;
      if (!ti.str || !ti.str.trim()) continue;
      const x = Math.round(ti.transform[4]);
      const y = Math.round(viewport.height - ti.transform[5]);
      const width = Math.round(ti.width ?? ti.str.length * 5);
      items.push({ x, y, width, text: ti.str.trim() });
    }
    pageItemSets.push(items);
  }

  if (pageItemSets.every((p) => p.length === 0))
    return [{ section: "Document", headers: ["Content"], rows: [] }];

  // Helper: build lines from text items
  function buildLines(items: TextItem[]): { items: TextItem[]; text: string }[] {
    if (items.length === 0) return [];
    const visualRows = groupIntoRows(items);
    const result: { items: TextItem[]; text: string }[] = [];
    for (const rowItems of visualRows) {
      const sorted = rowItems.sort((a, b) => a.x - b.x);
      let lineText = "";
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0) {
          const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
          lineText += gap > 10 ? "\t" : " ";
        }
        lineText += sorted[i].text;
      }
      result.push({ items: sorted, text: lineText.trim() });
    }
    return result;
  }

  // Step 1: Find the header row from page 1
  const HEADER_KEYWORDS = [
    "line", "qty", "item", "description", "length", "weight", "price", "amount",
    "unit", "total", "part", "mark", "quantity", "cost", "ship", "warehouse",
    "sales", "order", "customer", "po", "terms", "id", "no", "color", "size",
    "detail", "trim", "quan"
  ];

  const page1Lines = buildLines(pageItemSets[0]);

  let headerLineIdx = -1;
  let bestHeaderScore = 0;
  for (let i = 0; i < Math.min(page1Lines.length, 15); i++) {
    const words = page1Lines[i].text.toLowerCase().split(/[\t\s]+/);
    const score = words.filter((w) => HEADER_KEYWORDS.some((k) => w.includes(k))).length;
    if (score > bestHeaderScore) {
      bestHeaderScore = score;
      headerLineIdx = i;
    }
  }
  if (headerLineIdx < 0 || bestHeaderScore < 2) headerLineIdx = 0;

  // Step 2: Build column definitions from the header row
  const headerItems = page1Lines[headerLineIdx].items;

  // Merge header items that are close together (multi-word headers like "Unit Price")
  const headerGroups: { x: number; endX: number; text: string }[] = [];
  for (const item of headerItems) {
    const endX = item.x + item.width;
    if (headerGroups.length > 0) {
      const last = headerGroups[headerGroups.length - 1];
      const gap = item.x - last.endX;
      if (gap < 15) {
        last.text += " " + item.text;
        last.endX = endX;
        continue;
      }
    }
    headerGroups.push({ x: item.x, endX, text: item.text });
  }

  // Merge multi-line headers from lines above
  for (let above = headerLineIdx - 1; above >= Math.max(0, headerLineIdx - 3); above--) {
    const aboveItems = page1Lines[above].items;
    let merged = false;
    for (const ai of aboveItems) {
      for (const hg of headerGroups) {
        if (Math.abs(ai.x - hg.x) < 20 || (ai.x >= hg.x - 5 && ai.x <= hg.endX + 5)) {
          hg.text = ai.text + " " + hg.text;
          merged = true;
          break;
        }
      }
    }
    if (!merged) break;
  }

  const headers = headerGroups.map((g) => g.text.trim());
  const colBoundaries = headerGroups.map((g) => g.x);

  // Build a fingerprint of the header line to detect repeats on other pages
  const headerFingerprint = page1Lines[headerLineIdx].text.toLowerCase().replace(/\s+/g, " ").trim();

  // Step 3: Collect data rows from all pages, skipping repeated headers
  const dataRows: string[][] = [];

  for (let p = 0; p < pageItemSets.length; p++) {
    const lines = p === 0 ? page1Lines : buildLines(pageItemSets[p]);
    const startIdx = p === 0 ? headerLineIdx + 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      // Check if this line is a repeated header (or part of the header block)
      const lineFingerprint = lines[i].text.toLowerCase().replace(/\s+/g, " ").trim();

      // Skip if it matches the header fingerprint (exact or high similarity)
      if (isRepeatedHeader(lineFingerprint, headerFingerprint)) continue;

      // Skip lines that look like page headers/footers (phone numbers, company info, etc.)
      // These typically appear before the first data row on each page
      if (p > 0 && i < 5 && looksLikePageHeader(lineFingerprint, HEADER_KEYWORDS)) continue;

      const row = assignToColumns(lines[i].items, colBoundaries);
      if (row.some((c) => c.trim())) {
        dataRows.push(row);
      }
    }
  }

  if (dataRows.length === 0) return [{ section: "All Pages", headers, rows: [] }];

  // Step 4: Find the "Line" column and merge multi-line rows
  const lineColIdx = findLineNumberColumn(headers, dataRows);
  const mergedRows = mergeMultiLineRows(dataRows, lineColIdx, headers.length);

  // Step 5: Extract sub-fields
  const { headers: finalHeaders, rows: finalRows } = extractSubFields(headers, mergedRows);

  return [{ section: "All Pages", headers: finalHeaders, rows: finalRows }];
}

// Check if a line is a repeated header row
function isRepeatedHeader(lineText: string, headerFingerprint: string): boolean {
  if (lineText === headerFingerprint) return true;

  // Check if the line contains most of the header keywords
  const headerWords = headerFingerprint.split(" ").filter((w) => w.length > 2);
  if (headerWords.length === 0) return false;
  const matchCount = headerWords.filter((w) => lineText.includes(w)).length;
  return matchCount / headerWords.length >= 0.6;
}

// Check if a line looks like a page header/footer (company info, phone, address, etc.)
function looksLikePageHeader(lineText: string, headerKeywords: string[]): boolean {
  // Contains phone number pattern
  if (/\(\d{3}\)\s*\d{3}[- ]\d{4}/.test(lineText)) return true;
  // Contains many header keywords (it's a repeated table header)
  const words = lineText.split(/\s+/);
  const kwCount = words.filter((w) => headerKeywords.some((k) => w.includes(k))).length;
  if (kwCount >= 3) return true;
  // Very short lines at top of page are likely headers/footers
  if (lineText.length < 10) return true;
  return false;
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
