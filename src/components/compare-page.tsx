"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { ReportViewer } from "@/components/report-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRightLeft, RotateCcw, Plus, X } from "lucide-react";
import { getFileType } from "@/lib/parsers";
import { parseFileToTables } from "@/lib/structured-parser";
import { compareMultiFiles, generateId } from "@/lib/structured-differ";
import { saveComparison, type ComparisonRecord } from "@/lib/db";

type Step = "upload" | "result";

interface FileSlot {
  file: File | null;
  label: string;
}

function autoDetectKeyColumn(headers: string[]): { index: number; name: string } {
  const keyNames = ["item", "part", "part number", "part no", "sku", "code", "id", "name", "product", "material", "mark"];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (keyNames.some((k) => h.includes(k))) {
      return { index: i, name: headers[i] };
    }
  }
  // Fallback: use first non-empty-looking column
  return { index: 0, name: headers[0] ?? "Column 1" };
}

export function ComparePage() {
  const [fileSlots, setFileSlots] = useState<FileSlot[]>([
    { file: null, label: "File A" },
    { file: null, label: "File B" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [result, setResult] = useState<ComparisonRecord | null>(null);

  const filledSlots = fileSlots.filter((s) => s.file !== null);
  const canCompare = filledSlots.length >= 2 && !loading;

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

  // Upload → Parse → Auto-detect key → Compare → Results (all in one step)
  const handleCompare = async () => {
    const files = fileSlots.filter((s) => s.file !== null);
    if (files.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      // Parse all files
      const allTables = await Promise.all(
        files.map((s) => parseFileToTables(s.file!))
      );

      // Auto-detect key column from first file's headers
      const headers = allTables[0]?.[0]?.headers ?? [];
      const keyCol = autoDetectKeyColumn(headers);

      // Run comparison
      const fileType = getFileType(files[0].file!.name) ?? "unknown";
      const { headers: resultHeaders, rows, summary } = compareMultiFiles(allTables, keyCol.index);

      const record: ComparisonRecord = {
        id: generateId(),
        fileNames: files.map((s) => s.file!.name),
        fileLabels: files.map((s) => s.label),
        fileType,
        date: new Date().toISOString(),
        headers: resultHeaders,
        keyColumn: keyCol.name,
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
          {step === "result" && "Comparison results"}
        </p>
      </div>

      {/* ─── Upload ─── */}
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
              disabled={!canCompare}
              onClick={handleCompare}
              className="min-w-[200px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing & comparing {filledSlots.length} files...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Compare {filledSlots.length} Files
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* ─── Results ─── */}
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
