import { openDB, DBSchema } from "idb";

export interface ComparisonRecord {
  id: string;
  fileName1: string;
  fileName2: string;
  fileType: string;
  date: string;
  summary: {
    totalItems: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  differences: DiffResult[];
}

export interface DiffResult {
  type: "added" | "removed" | "modified" | "unchanged";
  lineNumber?: number;
  content1?: string;
  content2?: string;
  details?: string;
}

interface CompareDB extends DBSchema {
  comparisons: {
    key: string;
    value: ComparisonRecord;
    indexes: { "by-date": string };
  };
}

const DB_NAME = "comparepdf-db";
const DB_VERSION = 1;

export async function getDB() {
  return openDB<CompareDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("comparisons", { keyPath: "id" });
      store.createIndex("by-date", "date");
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
