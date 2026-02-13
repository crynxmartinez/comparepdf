"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  FileDown,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  MinusCircle,
} from "lucide-react";
import type { ComparisonRecord, ComparedRow } from "@/lib/db";
import { downloadReport, downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

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
      {/* ─── Stats Summary ─── */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold shrink-0",
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
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Matching" count={summary.identical} color="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" />
            <StatCard label="Different" count={summary.modified} color="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" />
            <StatCard label="Only in File 2" count={summary.added} color="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" />
            <StatCard label="Only in File 1" count={summary.removed} color="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" />
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex items-center justify-between">
          <div className="grid grid-cols-2 gap-4 text-sm flex-1">
            <div>
              <p className="text-xs text-muted-foreground mb-1">File 1</p>
              <p className="font-medium truncate">{record.fileName1}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">File 2</p>
              <p className="font-medium truncate">{record.fileName2}</p>
            </div>
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            <Button variant="outline" size="sm" onClick={() => downloadReport(record)}>
              <Download className="h-4 w-4 mr-1" />
              Export HTML
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(record)}>
              <FileDown className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Different ─── */}
      {modified.length > 0 && (
        <SectionWithTable
          title="Different"
          subtitle={`${modified.length} rows have different values between the two files`}
          icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
          count={modified.length}
          badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          defaultOpen={true}
        >
          <DifferentTable rows={modified} />
        </SectionWithTable>
      )}

      {/* ─── Only in File 2 ─── */}
      {added.length > 0 && (
        <SectionWithTable
          title={`Only in ${record.fileName2}`}
          subtitle={`${added.length} rows exist only in File 2`}
          icon={<PlusCircle className="h-5 w-5 text-blue-500" />}
          count={added.length}
          badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
          defaultOpen={true}
        >
          <SimpleTable rows={added} headers={headers} fileKey="value2" />
        </SectionWithTable>
      )}

      {/* ─── Only in File 1 ─── */}
      {removed.length > 0 && (
        <SectionWithTable
          title={`Only in ${record.fileName1}`}
          subtitle={`${removed.length} rows exist only in File 1`}
          icon={<MinusCircle className="h-5 w-5 text-red-500" />}
          count={removed.length}
          badgeColor="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          defaultOpen={true}
        >
          <SimpleTable rows={removed} headers={headers} fileKey="value1" />
        </SectionWithTable>
      )}

      {/* ─── Matching ─── */}
      {identical.length > 0 && (
        <SectionWithTable
          title="Matching"
          subtitle={`${identical.length} rows are the same in both files`}
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
          count={identical.length}
          badgeColor="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          defaultOpen={false}
        >
          <SimpleTable rows={identical} headers={headers} fileKey="value1" />
        </SectionWithTable>
      )}

      {/* ─── All identical ─── */}
      {modified.length === 0 && added.length === 0 && removed.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <p className="text-lg font-semibold">Files are identical</p>
          <p className="text-sm text-muted-foreground">No differences found</p>
        </Card>
      )}
    </div>
  );
}

/* ─── Stat Card ─── */

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg px-3 py-2", color)}>
      <span className="text-xl font-bold">{count}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

/* ─── Collapsible Section ─── */

function SectionWithTable({
  title,
  subtitle,
  icon,
  count,
  badgeColor,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  badgeColor: string;
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
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", badgeColor)}>
            {count}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && <div className="border-t">{children}</div>}
    </Card>
  );
}

/* ─── Pagination ─── */

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p: number;
          if (totalPages <= 5) {
            p = i + 1;
          } else if (page <= 3) {
            p = i + 1;
          } else if (page >= totalPages - 2) {
            p = totalPages - 4 + i;
          } else {
            p = page - 2 + i;
          }
          return (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className="h-7 w-7 p-0 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          );
        })}
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Different Table (File 1 vs File 2 per row) ─── */

function DifferentTable({ rows }: { rows: ComparedRow[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-10">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Field</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">File 1</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">File 2</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => {
              const globalIdx = (page - 1) * PAGE_SIZE + rowIdx + 1;
              const changedCells = row.cells.filter((c) => c.changed);
              const matchCount = row.cells.filter((c) => !c.changed).length;

              return changedCells.map((cell, cellIdx) => (
                <tr
                  key={`${rowIdx}-${cellIdx}`}
                  className={cn(
                    cellIdx === 0 ? "border-t" : "",
                    "hover:bg-muted/20"
                  )}
                >
                  {cellIdx === 0 && (
                    <td className="px-4 py-2 text-xs text-muted-foreground align-top" rowSpan={changedCells.length + (matchCount > 0 ? 1 : 0)}>
                      {globalIdx}
                    </td>
                  )}
                  <td className="px-4 py-2 text-xs font-medium">{cell.header}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {cell.value1 || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {cell.value2 || "—"}
                    </span>
                  </td>
                </tr>
              )).concat(
                matchCount > 0
                  ? [
                      <tr key={`${rowIdx}-match`} className="bg-muted/10">
                        <td className="px-4 py-1.5 text-xs text-muted-foreground" colSpan={3}>
                          {matchCount} matching field{matchCount !== 1 ? "s" : ""}
                        </td>
                      </tr>,
                    ]
                  : []
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

/* ─── Simple Table (single file values) ─── */

function SimpleTable({
  rows,
  headers,
  fileKey,
}: {
  rows: ComparedRow[];
  headers: string[];
  fileKey: "value1" | "value2";
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-10">#</th>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageRows.map((row, rowIdx) => {
              const globalIdx = (page - 1) * PAGE_SIZE + rowIdx + 1;
              return (
                <tr key={rowIdx} className="hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{globalIdx}</td>
                  {row.cells.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-4 py-2 font-mono text-xs">
                      {cell[fileKey] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
