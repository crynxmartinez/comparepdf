"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { ReportViewer } from "@/components/report-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowRightLeft, RotateCcw, Key, ChevronLeft } from "lucide-react";
import { getFileType } from "@/lib/parsers";
import { parseFileToTables, type ParsedTable } from "@/lib/structured-parser";
import { compareTables, generateId } from "@/lib/structured-differ";
import { saveComparison, type ComparisonRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

type Step = "upload" | "pick-key" | "result";

export function ComparePage() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");

  // Parsed data (after upload, before compare)
  const [tables1, setTables1] = useState<ParsedTable[] | null>(null);
  const [tables2, setTables2] = useState<ParsedTable[] | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [keyColumnIndex, setKeyColumnIndex] = useState(0);

  const [result, setResult] = useState<ComparisonRecord | null>(null);

  const canParse = file1 && file2 && !loading;

  // Step 1 → Step 2: Parse files and show column picker
  const handleParseFiles = async () => {
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

    try {
      const [t1, t2] = await Promise.all([
        parseFileToTables(file1),
        parseFileToTables(file2),
      ]);

      setTables1(t1);
      setTables2(t2);

      // Get headers and a few preview rows from file 1
      const headers = t1[0]?.headers ?? [];
      const rows = t1[0]?.rows?.slice(0, 5) ?? [];
      setPreviewHeaders(headers);
      setPreviewRows(rows);

      // Auto-select best key column: prefer "Item", then "Name", then "Part", etc.
      const keyNames = ["item", "part", "part number", "part no", "sku", "code", "id", "name", "product", "material"];
      let bestKey = 0;
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i].toLowerCase().trim();
        if (keyNames.some((k) => h.includes(k))) {
          bestKey = i;
          break;
        }
      }
      setKeyColumnIndex(bestKey);
      setStep("pick-key");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred while parsing files."
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → Step 3: Run comparison with selected key column
  const handleCompare = async () => {
    if (!tables1 || !tables2 || !file1 || !file2) return;

    setLoading(true);
    setError(null);

    try {
      const type1 = getFileType(file1.name) ?? "unknown";
      const { headers, rows, summary } = compareTables(tables1, tables2, keyColumnIndex);

      const record: ComparisonRecord = {
        id: generateId(),
        fileName1: file1.name,
        fileName2: file2.name,
        fileType: type1,
        date: new Date().toISOString(),
        headers,
        summary,
        rows,
      };

      await saveComparison(record);
      setResult(record);
      setStep("result");
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
    setTables1(null);
    setTables2(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setKeyColumnIndex(0);
    setResult(null);
    setError(null);
    setStep("upload");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Comparison</h1>
        <p className="text-sm text-muted-foreground">
          {step === "upload" && "Upload two files of the same type to compare"}
          {step === "pick-key" && "Select the key column to match rows between files"}
          {step === "result" && "Comparison results"}
        </p>
      </div>

      {/* ─── Step 1: Upload ─── */}
      {step === "upload" && (
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

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-center">
            <Button
              size="lg"
              disabled={!canParse}
              onClick={handleParseFiles}
              className="min-w-[200px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing files...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Next: Pick Key Column
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* ─── Step 2: Pick Key Column ─── */}
      {step === "pick-key" && (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Key className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Which column is the item name/identifier?</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This column will be used to match rows between the two files. Click a column header to select it.
            </p>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {previewHeaders.map((h, idx) => (
                      <th
                        key={idx}
                        onClick={() => setKeyColumnIndex(idx)}
                        className={cn(
                          "px-4 py-3 text-left text-xs font-medium cursor-pointer transition-colors border-b",
                          idx === keyColumnIndex
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {idx === keyColumnIndex && <Key className="h-3 w-3" />}
                          {h}
                        </div>
                        {idx === keyColumnIndex && (
                          <span className="text-[10px] font-normal opacity-80">Key Column</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-muted/20">
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          className={cn(
                            "px-4 py-2 font-mono text-xs",
                            cellIdx === keyColumnIndex && "bg-primary/5 font-semibold"
                          )}
                        >
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewRows.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing first {previewRows.length} rows from File 1 as preview
              </p>
            )}
          </Card>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setStep("upload")}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              size="lg"
              disabled={loading}
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
                  Compare Using &quot;{previewHeaders[keyColumnIndex]}&quot;
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* ─── Step 3: Results ─── */}
      {step === "result" && result && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge>{result.fileType.toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">
                {result.fileName1} vs {result.fileName2}
              </span>
              <Badge variant="outline" className="text-xs">
                Key: {previewHeaders[keyColumnIndex]}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              New Comparison
            </Button>
          </div>
          <ReportViewer record={result} />
        </>
      )}
    </div>
  );
}
