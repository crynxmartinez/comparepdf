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
      // Flip Y (PDF is bottom-up) and add page offset so pages stack vertically
      const y = yOffset + (viewport.height - ti.transform[5]);
      const width = ti.width ?? ti.str.length * 5;
      allItems.push({ x, y, width, text: ti.str.trim(), page: i });
    }

    yOffset += viewport.height + 20; // gap between pages
  }

  if (allItems.length === 0) return [{ section: "Document", headers: ["Content"], rows: [] }];

  // Step 1: Discover column boundaries by clustering X positions
  const columnBoundaries = discoverColumns(allItems);

  // Step 2: Group items into rows by Y proximity
  const textRows = groupIntoRows(allItems);

  // Step 3: Assign each item in a row to a column
  const tableRows: string[][] = [];
  for (const rowItems of textRows) {
    const cells = assignToColumns(rowItems, columnBoundaries);
    if (cells.some((c) => c.trim())) {
      tableRows.push(cells);
    }
  }

  if (tableRows.length === 0) return [{ section: "Document", headers: ["Content"], rows: [] }];

  // Step 4: Detect header row and split
  const headers = tableRows[0].map((h, idx) => h || `Column ${idx + 1}`);
  const dataRows = tableRows.slice(1).filter((r) => r.some((c) => c.trim()));

  return [{ section: "All Pages", headers, rows: dataRows }];
}

// Cluster X positions to find column boundaries
function discoverColumns(items: { x: number; width: number }[]): number[] {
  // Collect all unique X start positions, rounded
  const xPositions = items.map((i) => Math.round(i.x));
  xPositions.sort((a, b) => a - b);

  // Cluster X positions that are within 8px of each other
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

  // Only keep clusters that appear frequently (at least 3 times = likely a column)
  const significantClusters = clusters.filter((c) => c.length >= 3);

  if (significantClusters.length <= 1) {
    // Fallback: use all clusters with at least 2 items
    const fallback = clusters.filter((c) => c.length >= 2);
    if (fallback.length <= 1) {
      return [Math.min(...xPositions)];
    }
    return fallback.map((c) => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
  }

  // Return the average X of each cluster as column start positions
  return significantClusters.map((c) =>
    Math.round(c.reduce((a, b) => a + b, 0) / c.length)
  );
}

// Group items into rows by Y proximity
function groupIntoRows(
  items: { x: number; y: number; width: number; text: string }[]
): { x: number; y: number; width: number; text: string }[][] {
  // Sort by Y then X
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: { x: number; y: number; width: number; text: string }[][] = [];
  let currentRow: typeof sorted = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    // Items within 4px vertically are on the same row
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
    // Find the closest column boundary
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
