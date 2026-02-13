import type { ComparedRow, ComparedCell, ComparisonRecord } from "./db";
import type { ParsedTable } from "./structured-parser";

/**
 * Compare N sets of parsed tables using a key column to match rows across all files.
 */
export function compareMultiFiles(
  allTables: ParsedTable[][],
  keyColumnIndex: number = 0
): { headers: string[]; rows: ComparedRow[]; summary: ComparisonRecord["summary"] } {
  const fileCount = allTables.length;

  // Merge tables per file and unify headers across all files
  const perFile = allTables.map((tables) => mergeTables(tables));
  const headers = unifyAllHeaders(perFile.map((f) => f.headers));
  const normalizedFiles = perFile.map((f) => normalizeRows(f.rows, f.headers, headers));

  const keyIdx = Math.min(keyColumnIndex, headers.length - 1);

  // Build key → row map per file
  const keyMaps: Map<string, number>[] = normalizedFiles.map((rows) => {
    const map = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const key = normalizeKey(rows[i][keyIdx] ?? "");
      if (key && !map.has(key)) map.set(key, i);
    }
    return map;
  });

  // Collect all unique keys across all files (preserving first-seen order)
  const allKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const keyMap of keyMaps) {
    for (const key of keyMap.keys()) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allKeys.push(key);
      }
    }
  }

  // Also try fuzzy matching for keys that only appear in one file
  const fuzzyMatched = new Map<string, string>(); // unmatchedKey → matchedKey
  for (const key of allKeys) {
    const presentCount = keyMaps.filter((m) => m.has(key)).length;
    if (presentCount === 1) {
      // Try to find a fuzzy match in other files
      let bestMatch = "";
      let bestSim = 0;
      for (const otherKey of allKeys) {
        if (otherKey === key) continue;
        const sim = stringSimilarity(key, otherKey);
        if (sim > bestSim && sim >= 0.6) {
          bestSim = sim;
          bestMatch = otherKey;
        }
      }
      if (bestMatch) fuzzyMatched.set(key, bestMatch);
    }
  }

  // Build compared rows
  const results: ComparedRow[] = [];
  const processedKeys = new Set<string>();

  for (const key of allKeys) {
    if (processedKeys.has(key)) continue;

    // Check if this key was fuzzy-matched to another
    const resolvedKey = fuzzyMatched.get(key) ?? key;
    if (processedKeys.has(resolvedKey) && resolvedKey !== key) continue;

    // Gather all keys that resolve to this one
    const relatedKeys = [resolvedKey];
    for (const [k, v] of fuzzyMatched) {
      if (v === resolvedKey && k !== resolvedKey) relatedKeys.push(k);
    }

    // Find which files have this item
    const presentIn: number[] = [];
    const fileRows: (string[] | null)[] = [];

    for (let f = 0; f < fileCount; f++) {
      let rowIdx: number | undefined;
      for (const rk of relatedKeys) {
        rowIdx = keyMaps[f].get(rk);
        if (rowIdx !== undefined) break;
      }
      if (rowIdx !== undefined) {
        presentIn.push(f);
        fileRows.push(normalizedFiles[f][rowIdx]);
      } else {
        fileRows.push(null);
      }
    }

    const missingFrom = Array.from({ length: fileCount }, (_, i) => i).filter(
      (i) => !presentIn.includes(i)
    );

    // Build cells with values from each file
    const cells: ComparedCell[] = headers.map((h, hIdx) => {
      const values = fileRows.map((row) => (row ? (row[hIdx] ?? "").trim() : undefined));
      const nonEmpty = values.filter((v) => v !== undefined) as string[];
      const allSame = nonEmpty.length > 0 && nonEmpty.every((v) => v === nonEmpty[0]);
      return { header: h, values, changed: !allSame || missingFrom.length > 0 };
    });

    // Determine status
    let status: ComparedRow["status"];
    if (missingFrom.length > 0) {
      status = "missing";
    } else {
      const hasChanges = cells.some((c) => {
        const vals = c.values.filter((v) => v !== undefined) as string[];
        return vals.length > 1 && !vals.every((v) => v === vals[0]);
      });
      status = hasChanges ? "modified" : "identical";
    }

    results.push({
      status,
      keyValue: resolvedKey,
      presentIn,
      missingFrom,
      cells,
    });

    for (const rk of relatedKeys) processedKeys.add(rk);
  }

  // Sort: missing first, then modified, then identical
  const order = { missing: 0, modified: 1, identical: 2 };
  results.sort((a, b) => order[a.status] - order[b.status]);

  const summary = calculateSummary(results, fileCount);
  return { headers, rows: results, summary };
}

// Legacy 2-file wrapper
export function compareTables(
  tables1: ParsedTable[],
  tables2: ParsedTable[],
  keyColumnIndex: number = 0
): { headers: string[]; rows: ComparedRow[]; summary: ComparisonRecord["summary"] } {
  return compareMultiFiles([tables1, tables2], keyColumnIndex);
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

function unifyAllHeaders(headerSets: string[][]): string[] {
  const headers: string[] = [];
  for (const set of headerSets) {
    for (const h of set) {
      const normalized = h.toLowerCase().trim();
      const exists = headers.some((existing) => existing.toLowerCase().trim() === normalized);
      if (!exists) headers.push(h);
    }
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

function normalizeKey(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, " ");
}

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

function calculateSummary(
  rows: ComparedRow[],
  fileCount: number
): ComparisonRecord["summary"] {
  const summary: ComparisonRecord["summary"] = {
    totalItems: rows.length,
    identical: 0,
    modified: 0,
    missing: 0,
    matchScore: 0,
    missingPerFile: new Array(fileCount).fill(0),
  };

  for (const row of rows) {
    summary[row.status]++;
    for (const f of row.missingFrom) {
      summary.missingPerFile[f]++;
    }
  }

  summary.matchScore =
    summary.totalItems > 0
      ? Math.round((summary.identical / summary.totalItems) * 100)
      : 100;

  return summary;
}

export function generateId(): string {
  return `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
