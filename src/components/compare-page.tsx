"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { ReportViewer } from "@/components/report-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRightLeft, RotateCcw, Key, ChevronLeft, Plus, X } from "lucide-react";
import { getFileType } from "@/lib/parsers";
import { parseFileToTables, type ParsedTable } from "@/lib/structured-parser";
import { compareMultiFiles, generateId } from "@/lib/structured-differ";
import { saveComparison, type ComparisonRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

type Step = "upload" | "pick-key" | "result";

interface FileSlot {
  file: File | null;
  label: string;
}

export function ComparePage() {
  const [fileSlots, setFileSlots] = useState<FileSlot[]>([
    { file: null, label: "File A" },
    { file: null, label: "File B" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");

  // Parsed data (after upload, before compare)
  const [allTables, setAllTables] = useState<ParsedTable[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [keyColumnIndex, setKeyColumnIndex] = useState(0);

  const [result, setResult] = useState<ComparisonRecord | null>(null);

  const filledSlots = fileSlots.filter((s) => s.file !== null);
  const canParse = filledSlots.length >= 2 && !loading;

  const addFileSlot = () => {
    if (fileSlots.length >= 6) return;
    const letter = String.fromCharCode(65 + fileSlots.length);
    setFileSlots([...fileSlots, { file: null, label: `File ${letter}` }]);
  };

  const removeFileSlot = (idx: number) => {
    if (fileSlots.length <= 2) return;
    setFileSlots(fileSlots.filter((_, i) => i !== idx));
  };

  const updateFile = (idx: number, file: File | null) => {
    const updated = [...fileSlots];
    updated[idx] = { ...updated[idx], file };
    setFileSlots(updated);
  };

  const updateLabel = (idx: number, label: string) => {
    const updated = [...fileSlots];
    updated[idx] = { ...updated[idx], label };
    setFileSlots(updated);
  };

  // Step 1 → Step 2: Parse files and show column picker
  const handleParseFiles = async () => {
    const files = fileSlots.filter((s) => s.file !== null);
    if (files.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const parsed = await Promise.all(
        files.map((s) => parseFileToTables(s.file!))
      );

      setAllTables(parsed);

      // Get headers and preview rows from first file
      const headers = parsed[0]?.[0]?.headers ?? [];
      const rows = parsed[0]?.[0]?.rows?.slice(0, 5) ?? [];
      setPreviewHeaders(headers);
      setPreviewRows(rows);

      // Auto-select best key column
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
    if (allTables.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const files = fileSlots.filter((s) => s.file !== null);
      const fileType = getFileType(files[0].file!.name) ?? "unknown";
      const { headers, rows, summary } = compareMultiFiles(allTables, keyColumnIndex);

      const record: ComparisonRecord = {
        id: generateId(),
        fileNames: files.map((s) => s.file!.name),
        fileLabels: files.map((s) => s.label),
        fileType,
        date: new Date().toISOString(),
        headers,
        keyColumn: previewHeaders[keyColumnIndex] ?? "Column 1",
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
    setFileSlots([
      { file: null, label: "File A" },
      { file: null, label: "File B" },
    ]);
    setAllTables([]);
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
          {step === "upload" && "Upload 2 or more files to compare"}
          {step === "pick-key" && "Select the key column to match rows across files"}
          {step === "result" && "Comparison results"}
        </p>
      </div>

      {/* ─── Step 1: Upload ─── */}
      {step === "upload" && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {fileSlots.map((slot, idx) => (
              <Card key={idx} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={slot.label}
                      onChange={(e) => updateLabel(idx, e.target.value)}
                      className="h-7 text-xs font-medium w-32"
                    />
                    {slot.file && (
                      <Badge variant="secondary" className="text-xs">
                        {getFileType(slot.file.name)?.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  {fileSlots.length > 2 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFileSlot(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <FileUpload
                  label={`Upload ${slot.label}`}
                  file={slot.file}
                  onFileSelect={(f) => updateFile(idx, f)}
                />
              </Card>
            ))}
          </div>

          {fileSlots.length < 6 && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={addFileSlot}>
                <Plus className="h-4 w-4 mr-1" />
                Add Another File
              </Button>
            </div>
          )}

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
                  Parsing {filledSlots.length} files...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Next: Pick Key Column ({filledSlots.length} files)
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
              This column will be used to match rows across all {allTables.length} files. Click a column header to select it.
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
                Showing first {previewRows.length} rows from {fileSlots[0]?.label} as preview
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
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{result.fileType.toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">
                {result.fileNames.join(" vs ")}
              </span>
              <Badge variant="outline" className="text-xs">
                Key: {result.keyColumn}
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
