"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  FileDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  MinusCircle,
} from "lucide-react";
import type { ComparisonRecord, ComparedRow } from "@/lib/db";
import { downloadReport, downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";

interface ReportViewerProps {
  record: ComparisonRecord;
}

export function ReportViewer({ record }: ReportViewerProps) {
  const { summary, rows, headers } = record;

  const modified = rows.filter((r) => r.status === "modified");
  const added = rows.filter((r) => r.status === "added");
  const removed = rows.filter((r) => r.status === "removed");
  const identical = rows.filter((r) => r.status === "identical");

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Dashboard */}
      <SummaryDashboard record={record} />

      {/* Export Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => downloadReport(record)}>
          <Download className="h-4 w-4 mr-1" />
          HTML Report
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(record)}>
          <FileDown className="h-4 w-4 mr-1" />
          CSV Export
        </Button>
      </div>

      {/* Section: Differences (Modified) */}
      {modified.length > 0 && (
        <ReportSection
          title="Different"
          subtitle={`${modified.length} row${modified.length !== 1 ? "s" : ""} with different values`}
          icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
          badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          badgeText={`${modified.length}`}
          defaultOpen={true}
        >
          <ComparisonTable headers={headers} rows={modified} showBothValues />
        </ReportSection>
      )}

      {/* Section: Added (Only in File 2) */}
      {added.length > 0 && (
        <ReportSection
          title="Only in File 2"
          subtitle={`${added.length} row${added.length !== 1 ? "s" : ""} found only in ${record.fileName2}`}
          icon={<PlusCircle className="h-5 w-5 text-green-500" />}
          badgeColor="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          badgeText={`${added.length}`}
          defaultOpen={true}
        >
          <ComparisonTable headers={headers} rows={added} showFile2Only />
        </ReportSection>
      )}

      {/* Section: Removed (Only in File 1) */}
      {removed.length > 0 && (
        <ReportSection
          title="Only in File 1"
          subtitle={`${removed.length} row${removed.length !== 1 ? "s" : ""} found only in ${record.fileName1}`}
          icon={<MinusCircle className="h-5 w-5 text-red-500" />}
          badgeColor="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          badgeText={`${removed.length}`}
          defaultOpen={true}
        >
          <ComparisonTable headers={headers} rows={removed} showFile1Only />
        </ReportSection>
      )}

      {/* Section: Matching Data */}
      {identical.length > 0 && (
        <ReportSection
          title="Matching"
          subtitle={`${identical.length} row${identical.length !== 1 ? "s" : ""} are the same in both files`}
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
          badgeColor="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          badgeText={`${identical.length}`}
          defaultOpen={false}
        >
          <ComparisonTable headers={headers} rows={identical} showIdentical />
        </ReportSection>
      )}

      {/* No differences */}
      {modified.length === 0 && added.length === 0 && removed.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <p className="text-lg font-semibold">Files are identical</p>
          <p className="text-sm text-muted-foreground">
            No differences found between the two files
          </p>
        </Card>
      )}
    </div>
  );
}

/* ─── Summary Dashboard ─── */

function SummaryDashboard({ record }: { record: ComparisonRecord }) {
  const { summary } = record;
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Match Score */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold",
              summary.matchScore >= 80
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : summary.matchScore >= 50
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {summary.matchScore}%
          </div>
          <div>
            <p className="text-sm font-semibold">Match Score</p>
            <p className="text-xs text-muted-foreground">
              {summary.totalRows} total rows compared
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatBadge
            label="Matching"
            count={summary.identical}
            icon={<CheckCircle2 className="h-4 w-4" />}
            color="text-green-600"
          />
          <StatBadge
            label="Different"
            count={summary.modified}
            icon={<AlertCircle className="h-4 w-4" />}
            color="text-amber-600"
          />
          <StatBadge
            label="Only in File 2"
            count={summary.added}
            icon={<PlusCircle className="h-4 w-4" />}
            color="text-blue-600"
          />
          <StatBadge
            label="Only in File 1"
            count={summary.removed}
            icon={<MinusCircle className="h-4 w-4" />}
            color="text-red-600"
          />
        </div>
      </div>

      <Separator className="my-4" />

      {/* File Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">File 1 (Original)</p>
          <p className="font-medium truncate">{record.fileName1}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">File 2 (Modified)</p>
          <p className="font-medium truncate">{record.fileName2}</p>
        </div>
      </div>
    </Card>
  );
}

function StatBadge({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("flex items-center gap-1", color)}>
        {icon}
        <span className="text-lg font-bold">{count}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* ─── Collapsible Report Section ─── */

function ReportSection({
  title,
  subtitle,
  icon,
  badgeColor,
  badgeText,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badgeColor: string;
  badgeText: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              badgeColor
            )}
          >
            {badgeText}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && <div className="border-t">{children}</div>}
    </Card>
  );
}

/* ─── Comparison Table ─── */

function ComparisonTable({
  headers,
  rows,
  showBothValues,
  showFile1Only,
  showFile2Only,
  showIdentical,
}: {
  headers: string[];
  rows: ComparedRow[];
  showBothValues?: boolean;
  showFile1Only?: boolean;
  showFile2Only?: boolean;
  showIdentical?: boolean;
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-8">
                #
              </th>
              {showBothValues ? (
                // For modified rows: show header, file1 val, file2 val
                <>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Field
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    File 1 Value
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    File 2 Value
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-20">
                    Status
                  </th>
                </>
              ) : (
                headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, rowIdx) =>
              showBothValues ? (
                <ModifiedRowView key={rowIdx} row={row} rowIdx={rowIdx} />
              ) : (
                <SimpleRowView
                  key={rowIdx}
                  row={row}
                  rowIdx={rowIdx}
                  showFile1Only={showFile1Only}
                  showFile2Only={showFile2Only}
                  showIdentical={showIdentical}
                />
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModifiedRowView({ row, rowIdx }: { row: ComparedRow; rowIdx: number }) {
  const changedCells = row.cells.filter((c) => c.changed);
  const unchangedCells = row.cells.filter((c) => !c.changed);

  return (
    <>
      {/* Changed cells first */}
      {changedCells.map((cell, cellIdx) => (
        <tr
          key={`${rowIdx}-changed-${cellIdx}`}
          className="bg-amber-50/50 dark:bg-amber-950/10"
        >
          {cellIdx === 0 && (
            <td
              className="px-3 py-2 text-xs text-muted-foreground align-top"
              rowSpan={changedCells.length + (unchangedCells.length > 0 ? 1 : 0)}
            >
              {rowIdx + 1}
            </td>
          )}
          <td className="px-3 py-2 font-medium text-xs">{cell.header}</td>
          <td className="px-3 py-2 font-mono text-xs">
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {cell.value1 || "—"}
            </span>
          </td>
          <td className="px-3 py-2 font-mono text-xs">
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {cell.value2 || "—"}
            </span>
          </td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              Changed
            </Badge>
          </td>
        </tr>
      ))}
      {/* Summary of unchanged cells */}
      {unchangedCells.length > 0 && changedCells.length > 0 && (
        <tr className="bg-muted/20">
          <td className="px-3 py-1.5 text-xs text-muted-foreground" colSpan={4}>
            + {unchangedCells.length} matching field{unchangedCells.length !== 1 ? "s" : ""}:{" "}
            <span className="text-foreground/70">
              {unchangedCells.map((c) => c.header).join(", ")}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

function SimpleRowView({
  row,
  rowIdx,
  showFile1Only,
  showFile2Only,
}: {
  row: ComparedRow;
  rowIdx: number;
  showFile1Only?: boolean;
  showFile2Only?: boolean;
  showIdentical?: boolean;
}) {
  const bgClass =
    row.status === "added"
      ? "bg-green-50/50 dark:bg-green-950/10"
      : row.status === "removed"
      ? "bg-red-50/50 dark:bg-red-950/10"
      : "";

  return (
    <tr className={bgClass}>
      <td className="px-3 py-2 text-xs text-muted-foreground">{rowIdx + 1}</td>
      {row.cells.map((cell, cellIdx) => (
        <td key={cellIdx} className="px-3 py-2 font-mono text-xs">
          {showFile1Only
            ? cell.value1 || "—"
            : showFile2Only
            ? cell.value2 || "—"
            : cell.value1 || "—"}
        </td>
      ))}
    </tr>
  );
}
