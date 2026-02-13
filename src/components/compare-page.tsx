"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { DiffViewer } from "@/components/diff-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRightLeft, RotateCcw } from "lucide-react";
import { extractText, getFileType } from "@/lib/parsers";
import { compareLines, generateSummary, generateId } from "@/lib/differ";
import { saveComparison, type ComparisonRecord } from "@/lib/db";

export function ComparePage() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonRecord | null>(null);

  const canCompare = file1 && file2 && !loading;

  const handleCompare = async () => {
    if (!file1 || !file2) return;

    const type1 = getFileType(file1.name);
    const type2 = getFileType(file2.name);

    if (!type1 || !type2) {
      setError("One or both files have unsupported file types.");
      return;
    }

    if (type1 !== type2) {
      setError(
        `File types don't match: ${file1.name} (${type1}) vs ${file2.name} (${type2}). Please compare files of the same type.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const [lines1, lines2] = await Promise.all([
        extractText(file1),
        extractText(file2),
      ]);

      const differences = compareLines(lines1, lines2);
      const summary = generateSummary(differences);

      const record: ComparisonRecord = {
        id: generateId(),
        fileName1: file1.name,
        fileName2: file2.name,
        fileType: type1,
        date: new Date().toISOString(),
        summary,
        differences,
      };

      await saveComparison(record);
      setResult(record);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred during comparison."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile1(null);
    setFile2(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Comparison</h1>
        <p className="text-sm text-muted-foreground">
          Upload two files of the same type to compare their contents
        </p>
      </div>

      {/* File Upload Area */}
      {!result && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">File 1 (Original)</span>
                {file1 && (
                  <Badge variant="secondary" className="text-xs">
                    {getFileType(file1.name)?.toUpperCase()}
                  </Badge>
                )}
              </div>
              <FileUpload
                label="Upload original file"
                file={file1}
                onFileSelect={setFile1}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">File 2 (Modified)</span>
                {file2 && (
                  <Badge variant="secondary" className="text-xs">
                    {getFileType(file2.name)?.toUpperCase()}
                  </Badge>
                )}
              </div>
              <FileUpload
                label="Upload modified file"
                file={file2}
                onFileSelect={setFile2}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Compare Button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              disabled={!canCompare}
              onClick={handleCompare}
              className="min-w-[200px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Compare Files
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge>{result.fileType.toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">
                {result.fileName1} vs {result.fileName2}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              New Comparison
            </Button>
          </div>
          <DiffViewer record={result} />
        </>
      )}
    </div>
  );
}
