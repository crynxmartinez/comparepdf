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
  const tables: ParsedTable[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by Y position to reconstruct rows
    const itemsByY: Map<number, { x: number; text: string }[]> = new Map();

    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ti = item as any;
      if (!ti.str || !ti.str.trim()) continue;
      // Round Y to group items on the same line (within 2px tolerance)
      const y = Math.round(ti.transform[5] / 2) * 2;
      const x = ti.transform[4];
      if (!itemsByY.has(y)) itemsByY.set(y, []);
      itemsByY.get(y)!.push({ x, text: ti.str.trim() });
    }

    // Sort by Y descending (PDF coords are bottom-up), then X ascending
    const sortedYs = Array.from(itemsByY.keys()).sort((a, b) => b - a);
    const rows: string[][] = [];

    for (const y of sortedYs) {
      const items = itemsByY.get(y)!.sort((a, b) => a.x - b.x);
      // Detect columns by X-position gaps
      const cells = detectColumns(items);
      if (cells.length > 0 && cells.some((c) => c.trim())) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      // Try to detect header row (first row or row with common header keywords)
      const maxCols = Math.max(...rows.map((r) => r.length));
      const normalizedRows = rows.map((r) => {
        while (r.length < maxCols) r.push("");
        return r;
      });

      const headers = normalizedRows[0].map(
        (h, idx) => h || `Column ${idx + 1}`
      );
      const dataRows = normalizedRows.slice(1);

      tables.push({
        section: `Page ${i}`,
        headers,
        rows: dataRows,
      });
    }
  }

  // If no structured tables found, fall back to line-by-line
  if (tables.length === 0) {
    return fallbackPdfParse(file);
  }

  return tables;
}

function detectColumns(items: { x: number; text: string }[]): string[] {
  if (items.length <= 1) return items.map((i) => i.text);

  // Detect gaps between items to split into columns
  const cells: string[] = [];
  let currentCell = items[0].text;
  const GAP_THRESHOLD = 15; // pixels gap to consider a new column

  for (let i = 1; i < items.length; i++) {
    const gap = items[i].x - (items[i - 1].x + items[i - 1].text.length * 4);
    if (gap > GAP_THRESHOLD) {
      cells.push(currentCell.trim());
      currentCell = items[i].text;
    } else {
      currentCell += " " + items[i].text;
    }
  }
  cells.push(currentCell.trim());
  return cells;
}

async function fallbackPdfParse(file: File): Promise<ParsedTable[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rows: string[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    const lines = pageText.split(/\s{2,}|\n/).filter((l: string) => l.trim());
    for (const line of lines) {
      rows.push([line.trim()]);
    }
  }

  return [
    {
      section: "Document",
      headers: ["Content"],
      rows,
    },
  ];
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
