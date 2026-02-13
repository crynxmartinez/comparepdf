import { diffArrays } from "diff";
import type { DiffResult, ComparisonRecord } from "./db";

export function compareLines(lines1: string[], lines2: string[]): DiffResult[] {
  const results: DiffResult[] = [];
  const changes = diffArrays(lines1, lines2);

  let lineNum1 = 1;
  let lineNum2 = 1;

  for (const change of changes) {
    if (change.added) {
      for (const val of change.value) {
        results.push({
          type: "added",
          lineNumber: lineNum2,
          content2: val,
        });
        lineNum2++;
      }
    } else if (change.removed) {
      for (const val of change.value) {
        results.push({
          type: "removed",
          lineNumber: lineNum1,
          content1: val,
        });
        lineNum1++;
      }
    } else {
      for (const val of change.value) {
        results.push({
          type: "unchanged",
          lineNumber: lineNum1,
          content1: val,
          content2: val,
        });
        lineNum1++;
        lineNum2++;
      }
    }
  }

  return results;
}

export function generateSummary(differences: DiffResult[]): ComparisonRecord["summary"] {
  const summary = {
    totalItems: differences.length,
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
  };

  for (const diff of differences) {
    switch (diff.type) {
      case "added":
        summary.added++;
        break;
      case "removed":
        summary.removed++;
        break;
      case "modified":
        summary.modified++;
        break;
      case "unchanged":
        summary.unchanged++;
        break;
    }
  }

  return summary;
}

export function generateId(): string {
  return `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
