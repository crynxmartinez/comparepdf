"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { ReportViewer } from "@/components/report-viewer";
import { ColumnMapper, type ColumnMapping } from "@/components/column-mapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRightLeft, RotateCcw, Plus, X } from "lucide-react";
import { getFileType } from "@/lib/parsers";
import { parseFileToTables, type ParsedTable } from "@/lib/structured-parser";
import { compareMultiFiles, compareMappedFiles, generateId } from "@/lib/structured-differ";
import { saveComparison, type ComparisonRecord } from "@/lib/db";

type Step = "upload" | "mapping" | "result";

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
  return { index: 0, name: headers[0] ?? "Column 1" };
}

function headersMatch(headersA: string[], headersB: string[]): boolean {
  if (headersA.length !== headersB.length) return false;
  const normA = headersA.map((h) => h.toLowerCase().trim()).sort();
  const normB = headersB.map((h) => h.toLowerCase().trim()).sort();
  return normA.every((h, i) => h === normB[i]);
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

  // Mapping step state
  const [parsedTables, setParsedTables] = useState<ParsedTable[][] | null>(null);
  const [parsedLabels, setParsedLabels] = useState<string[]>([]);
  const [parsedFileNames, setParsedFileNames] = useState<string[]>([]);
  const [parsedFileType, setParsedFileType] = useState<string>("unknown");

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

      const fileType = getFileType(files[0].file!.name) ?? "unknown";
      const fileNames = files.map((s) => s.file!.name);
      const labels = files.map((s) => s.label);

      // Check if headers match across all files
      const allHeaders = allTables.map((t) => t[0]?.headers ?? []);
      const allMatch = allHeaders.every((h) => headersMatch(h, allHeaders[0]));

      if (allMatch) {
        // Headers match — auto-compare as before
        const keyCol = autoDetectKeyColumn(allHeaders[0]);
        const { headers: resultHeaders, rows, summary } = compareMultiFiles(allTables, keyCol.index);

        const record: ComparisonRecord = {
          id: generateId(),
          fileNames,
          fileLabels: labels,
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
      } else {
        // Headers don't match — show mapping UI
        setParsedTables(allTables);
        setParsedLabels(labels);
        setParsedFileNames(fileNames);
        setParsedFileType(fileType);
        setStep("mapping");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred during comparison."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMappingConfirm = async (mapping: ColumnMapping) => {
    if (!parsedTables || parsedTables.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const { headers: resultHeaders, rows, summary } = compareMappedFiles(
        parsedTables[0],
        parsedTables[1],
        mapping
      );

      const record: ComparisonRecord = {
        id: generateId(),
        fileNames: parsedFileNames,
        fileLabels: parsedLabels,
        fileType: parsedFileType,
        date: new Date().toISOString(),
        headers: resultHeaders,
        keyColumn: resultHeaders[0] ?? "Key",
        summary,
        rows,
      };

      await saveComparison(record);
      setResult(record);
      setStep("result");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred during mapped comparison."
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
    setParsedTables(null);
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
          {step === "mapping" && "Map columns between files with different headers"}
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
                  Parsing {filledSlots.length} files...
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

      {/* ─── Column Mapping ─── */}
      {step === "mapping" && parsedTables && parsedTables.length >= 2 && (
        <>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}
          <ColumnMapper
            headersA={parsedTables[0][0]?.headers ?? []}
            headersB={parsedTables[1][0]?.headers ?? []}
            labelA={parsedLabels[0] ?? "File A"}
            labelB={parsedLabels[1] ?? "File B"}
            onConfirm={handleMappingConfirm}
            onCancel={handleReset}
          />
          {loading && (
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}

      {/* ─── Results ─── */}
      {step === "result" && result && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{(result.fileType ?? "unknown").toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">
                {(result.fileNames ?? []).join(" vs ")}
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
