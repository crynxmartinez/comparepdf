import type { ComparedRow, ComparedCell, ComparisonRecord } from "./db";
import type { ParsedTable } from "./structured-parser";

/**
 * Compare two sets of parsed tables using a key column to match rows.
 * keyColumnIndex: the column index to use as the row identifier (e.g., item name).
 */
export function compareTables(
  tables1: ParsedTable[],
  tables2: ParsedTable[],
  keyColumnIndex: number = 0
): { headers: string[]; rows: ComparedRow[]; summary: ComparisonRecord["summary"] } {
  const { headers: h1, rows: rows1 } = mergeTables(tables1);
  const { headers: h2, rows: rows2 } = mergeTables(tables2);

  const headers = unifyHeaders(h1, h2);

  const norm1 = normalizeRows(rows1, h1, headers);
  const norm2 = normalizeRows(rows2, h2, headers);

  // Clamp key column index
  const keyIdx = Math.min(keyColumnIndex, headers.length - 1);

  const comparedRows = matchByKeyColumn(norm1, norm2, headers, keyIdx);
  const summary = calculateSummary(comparedRows);

  return { headers, rows: comparedRows, summary };
}

function mergeTables(tables: ParsedTable[]): { headers: string[]; rows: string[][] } {
  if (tables.length === 0) return { headers: [], rows: [] };
  if (tables.length === 1) return { headers: tables[0].headers, rows: tables[0].rows };

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

/**
 * Match rows by key column value.
 * 1. Exact match on key column
 * 2. Fuzzy match on key column for remaining unmatched rows
 * 3. Leftover rows are "only in file 1" or "only in file 2"
 */
function matchByKeyColumn(
  rows1: string[][],
  rows2: string[][],
  headers: string[],
  keyIdx: number
): ComparedRow[] {
  const results: ComparedRow[] = [];
  const matched2: Set<number> = new Set();

  // Build a map of key values → row indices for file 2
  const key2Map: Map<string, number[]> = new Map();
  for (let j = 0; j < rows2.length; j++) {
    const key = normalizeKey(rows2[j][keyIdx] ?? "");
    if (!key) continue;
    if (!key2Map.has(key)) key2Map.set(key, []);
    key2Map.get(key)!.push(j);
  }

  // Pass 1: Exact match on key column
  const unmatched1: number[] = [];
  for (let i = 0; i < rows1.length; i++) {
    const key = normalizeKey(rows1[i][keyIdx] ?? "");
    if (!key) {
      unmatched1.push(i);
      continue;
    }

    const candidates = key2Map.get(key);
    if (candidates && candidates.length > 0) {
      // Find best candidate (not yet matched)
      const j = candidates.find((c) => !matched2.has(c));
      if (j !== undefined) {
        matched2.add(j);
        const cells = buildCells(headers, rows1[i], rows2[j]);
        const allSame = cells.every((c) => !c.changed);
        results.push({
          status: allSame ? "identical" : "modified",
          rowIndex: i + 1,
          cells,
        });
        continue;
      }
    }
    unmatched1.push(i);
  }

  // Pass 2: Fuzzy match remaining unmatched rows by key similarity
  const unmatched2: number[] = [];
  for (let j = 0; j < rows2.length; j++) {
    if (!matched2.has(j)) unmatched2.push(j);
  }

  const stillUnmatched1: number[] = [];
  for (const i of unmatched1) {
    const key1 = normalizeKey(rows1[i][keyIdx] ?? "");
    if (!key1) {
      stillUnmatched1.push(i);
      continue;
    }

    let bestJ = -1;
    let bestSim = 0;
    for (const j of unmatched2) {
      if (matched2.has(j)) continue;
      const key2 = normalizeKey(rows2[j][keyIdx] ?? "");
      if (!key2) continue;
      const sim = stringSimilarity(key1, key2);
      if (sim > bestSim) {
        bestSim = sim;
        bestJ = j;
      }
    }

    // Require at least 60% similarity on the key to fuzzy-match
    if (bestJ >= 0 && bestSim >= 0.6) {
      matched2.add(bestJ);
      const cells = buildCells(headers, rows1[i], rows2[bestJ]);
      const allSame = cells.every((c) => !c.changed);
      results.push({
        status: allSame ? "identical" : "modified",
        rowIndex: i + 1,
        cells,
      });
    } else {
      stillUnmatched1.push(i);
    }
  }

  // Remaining unmatched from file 1 → "only in file 1"
  for (const i of stillUnmatched1) {
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

  // Remaining unmatched from file 2 → "only in file 2"
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

function normalizeKey(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, " ");
}

// Simple string similarity (Dice coefficient on bigrams)
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.slice(i, i + 2))) intersection++;
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1);
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
