import { openDB, DBSchema } from "idb";

export interface ComparedCell {
  header: string;
  /** values[i] = value from file i. Length matches fileNames.length */
  values: (string | undefined)[];
  changed: boolean;
}

export interface ComparedRow {
  /** "identical" = same in all files, "modified" = exists in 2+ files with differences */
  /** "missing" = missing from one or more files (but present in at least one) */
  status: "identical" | "modified" | "missing";
  /** Key column value for this row */
  keyValue: string;
  /** Which file indices have this row (e.g., [0,1] = in files A & B but not C) */
  presentIn: number[];
  /** Which file indices are missing this row */
  missingFrom: number[];
  cells: ComparedCell[];
}

export interface ComparisonRecord {
  id: string;
  /** Ordered list of file names */
  fileNames: string[];
  /** Optional user-given labels (e.g., "Quicken SO", "Shipper") */
  fileLabels: string[];
  fileType: string;
  date: string;
  headers: string[];
  keyColumn: string;
  summary: {
    totalItems: number;
    identical: number;
    modified: number;
    missing: number;
    matchScore: number;
    /** Per-file: how many items are missing from each file */
    missingPerFile: number[];
  };
  rows: ComparedRow[];
}

interface CompareDB extends DBSchema {
  comparisons: {
    key: string;
    value: ComparisonRecord;
    indexes: { "by-date": string };
  };
}

const DB_NAME = "comparepdf-db";
const DB_VERSION = 2;

export async function getDB() {
  return openDB<CompareDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("comparisons")) {
        const store = db.createObjectStore("comparisons", { keyPath: "id" });
        store.createIndex("by-date", "date");
      }
    },
  });
}

export async function saveComparison(record: ComparisonRecord) {
  const db = await getDB();
  await db.put("comparisons", record);
}

export async function getComparisons(): Promise<ComparisonRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("comparisons", "by-date");
  return all.reverse();
}

export async function getComparison(id: string): Promise<ComparisonRecord | undefined> {
  const db = await getDB();
  return db.get("comparisons", id);
}

export async function deleteComparison(id: string) {
  const db = await getDB();
  await db.delete("comparisons", id);
}

export async function clearAllComparisons() {
  const db = await getDB();
  await db.clear("comparisons");
}
