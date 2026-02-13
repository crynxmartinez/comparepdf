import type { ComparedRow, ComparedCell, ComparisonRecord } from "./db";
import type { ParsedTable } from "./structured-parser";

export function compareTables(
  tables1: ParsedTable[],
  tables2: ParsedTable[]
): { headers: string[]; rows: ComparedRow[]; summary: ComparisonRecord["summary"] } {
  // Merge all tables into unified rows with consistent headers
  const { headers: h1, rows: rows1 } = mergeTables(tables1);
  const { headers: h2, rows: rows2 } = mergeTables(tables2);

  // Unify headers from both files
  const headers = unifyHeaders(h1, h2);

  // Normalize rows to have same number of columns
  const norm1 = normalizeRows(rows1, h1, headers);
  const norm2 = normalizeRows(rows2, h2, headers);

  // Match rows between files
  const comparedRows = matchAndCompareRows(norm1, norm2, headers);

  // Calculate summary
  const summary = calculateSummary(comparedRows);

  return { headers, rows: comparedRows, summary };
}

function mergeTables(tables: ParsedTable[]): { headers: string[]; rows: string[][] } {
  if (tables.length === 0) return { headers: [], rows: [] };
  if (tables.length === 1) return { headers: tables[0].headers, rows: tables[0].rows };

  // Use headers from the table with the most columns
  let bestHeaders = tables[0].headers;
  for (const t of tables) {
    if (t.headers.length > bestHeaders.length) bestHeaders = t.headers;
  }

  const allRows: string[][] = [];
  for (const t of tables) {
    for (const row of t.rows) {
      const normalized = [...row];
      while (normalized.length < bestHeaders.length) normalized.push("");
      allRows.push(normalized);
    }
  }

  return { headers: bestHeaders, rows: allRows };
}

function unifyHeaders(h1: string[], h2: string[]): string[] {
  const headers: string[] = [...h1];
  for (const h of h2) {
    const normalized = h.toLowerCase().trim();
    const exists = headers.some((existing) => existing.toLowerCase().trim() === normalized);
    if (!exists) headers.push(h);
  }
  return headers;
}

function normalizeRows(
  rows: string[][],
  originalHeaders: string[],
  unifiedHeaders: string[]
): string[][] {
  return rows.map((row) => {
    const newRow: string[] = new Array(unifiedHeaders.length).fill("");
    for (let i = 0; i < originalHeaders.length && i < row.length; i++) {
      const headerNorm = originalHeaders[i].toLowerCase().trim();
      const targetIdx = unifiedHeaders.findIndex(
        (h) => h.toLowerCase().trim() === headerNorm
      );
      if (targetIdx >= 0) {
        newRow[targetIdx] = row[i] ?? "";
      }
    }
    return newRow;
  });
}

function matchAndCompareRows(
  rows1: string[][],
  rows2: string[][],
  headers: string[]
): ComparedRow[] {
  const results: ComparedRow[] = [];
  const matched2: Set<number> = new Set();

  // For each row in file 1, find the best match in file 2
  for (let i = 0; i < rows1.length; i++) {
    let bestMatch = -1;
    let bestScore = 0;

    for (let j = 0; j < rows2.length; j++) {
      if (matched2.has(j)) continue;
      const score = rowSimilarity(rows1[i], rows2[j]);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = j;
      }
    }

    // Threshold: at least 30% similarity to consider a match
    if (bestMatch >= 0 && bestScore >= 0.3) {
      matched2.add(bestMatch);
      const cells = buildCells(headers, rows1[i], rows2[bestMatch]);
      const allSame = cells.every((c) => !c.changed);

      results.push({
        status: allSame ? "identical" : "modified",
        rowIndex: i + 1,
        cells,
      });
    } else {
      // Row only in file 1
      results.push({
        status: "removed",
        rowIndex: i + 1,
        cells: headers.map((h, idx) => ({
          header: h,
          value1: rows1[i][idx] ?? "",
          value2: undefined,
          changed: true,
        })),
      });
    }
  }

  // Remaining unmatched rows from file 2
  for (let j = 0; j < rows2.length; j++) {
    if (matched2.has(j)) continue;
    results.push({
      status: "added",
      rowIndex: j + 1,
      cells: headers.map((h, idx) => ({
        header: h,
        value1: undefined,
        value2: rows2[j][idx] ?? "",
        changed: true,
      })),
    });
  }

  // Sort: modified first, then added, then removed, then identical
  const order = { modified: 0, added: 1, removed: 2, identical: 3 };
  results.sort((a, b) => order[a.status] - order[b.status]);

  return results;
}

function rowSimilarity(row1: string[], row2: string[]): number {
  const maxLen = Math.max(row1.length, row2.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  for (let i = 0; i < maxLen; i++) {
    const v1 = (row1[i] ?? "").trim().toLowerCase();
    const v2 = (row2[i] ?? "").trim().toLowerCase();
    if (v1 === v2) {
      matches++;
    } else if (v1 && v2 && (v1.includes(v2) || v2.includes(v1))) {
      matches += 0.5;
    }
  }

  return matches / maxLen;
}

function buildCells(headers: string[], row1: string[], row2: string[]): ComparedCell[] {
  return headers.map((h, idx) => {
    const v1 = (row1[idx] ?? "").trim();
    const v2 = (row2[idx] ?? "").trim();
    return {
      header: h,
      value1: v1,
      value2: v2,
      changed: v1 !== v2,
    };
  });
}

function calculateSummary(rows: ComparedRow[]): ComparisonRecord["summary"] {
  const summary = {
    totalRows: rows.length,
    identical: 0,
    modified: 0,
    added: 0,
    removed: 0,
    matchScore: 0,
  };

  for (const row of rows) {
    summary[row.status]++;
  }

  summary.matchScore =
    summary.totalRows > 0
      ? Math.round((summary.identical / summary.totalRows) * 100)
      : 100;

  return summary;
}

export function generateId(): string {
  return `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
