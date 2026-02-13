"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileDown, Filter } from "lucide-react";
import type { ComparisonRecord, DiffResult } from "@/lib/db";
import { downloadReport, downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  record: ComparisonRecord;
}

type FilterType = "all" | "added" | "removed" | "modified" | "unchanged";

export function DiffViewer({ record }: DiffViewerProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const { summary, differences } = record;

  const filtered =
    filter === "all"
      ? differences
      : differences.filter((d) => d.type === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Added" count={summary.added} color="text-green-600 bg-green-50 dark:bg-green-950/30" />
        <SummaryCard label="Removed" count={summary.removed} color="text-red-600 bg-red-50 dark:bg-red-950/30" />
        <SummaryCard label="Modified" count={summary.modified} color="text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" />
        <SummaryCard label="Unchanged" count={summary.unchanged} color="text-muted-foreground bg-muted" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
            {(["all", "added", "removed", "modified", "unchanged"] as FilterType[]).map(
              (f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs capitalize"
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              )
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadReport(record)}
          >
            <Download className="h-4 w-4 mr-1" />
            HTML Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(record)}
          >
            <FileDown className="h-4 w-4 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      {/* Diff View */}
      <Tabs defaultValue="side-by-side">
        <TabsList>
          <TabsTrigger value="side-by-side">Side by Side</TabsTrigger>
          <TabsTrigger value="unified">Unified</TabsTrigger>
        </TabsList>

        <TabsContent value="side-by-side">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <div className="px-4 py-2">{record.fileName1}</div>
              <div className="border-l px-4 py-2">{record.fileName2}</div>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {filtered.map((diff, i) => (
                  <SideBySideRow key={i} diff={diff} />
                ))}
                {filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No differences found for this filter.
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="unified">
          <Card className="overflow-hidden">
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {filtered.map((diff, i) => (
                  <UnifiedRow key={i} diff={diff} />
                ))}
                {filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No differences found for this filter.
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {differences.length} lines
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <Card className={cn("flex flex-col items-center justify-center p-4", color)}>
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-xs font-medium">{label}</span>
    </Card>
  );
}

function SideBySideRow({ diff }: { diff: DiffResult }) {
  const bgClass =
    diff.type === "added"
      ? "bg-green-50/50 dark:bg-green-950/20"
      : diff.type === "removed"
      ? "bg-red-50/50 dark:bg-red-950/20"
      : diff.type === "modified"
      ? "bg-yellow-50/50 dark:bg-yellow-950/20"
      : "";

  return (
    <div className={cn("grid grid-cols-2 text-xs font-mono", bgClass)}>
      <div className="flex gap-2 px-3 py-1.5">
        <span className="w-8 shrink-0 text-right text-muted-foreground">
          {diff.type !== "added" ? diff.lineNumber : ""}
        </span>
        <span className={cn(diff.type === "removed" && "text-red-600 dark:text-red-400")}>
          {diff.content1 ?? ""}
        </span>
      </div>
      <div className="flex gap-2 border-l px-3 py-1.5">
        <span className="w-8 shrink-0 text-right text-muted-foreground">
          {diff.type !== "removed" ? diff.lineNumber : ""}
        </span>
        <span className={cn(diff.type === "added" && "text-green-600 dark:text-green-400")}>
          {diff.content2 ?? ""}
        </span>
      </div>
    </div>
  );
}

function UnifiedRow({ diff }: { diff: DiffResult }) {
  const prefix =
    diff.type === "added" ? "+" : diff.type === "removed" ? "-" : " ";
  const bgClass =
    diff.type === "added"
      ? "bg-green-50/50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
      : diff.type === "removed"
      ? "bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
      : diff.type === "modified"
      ? "bg-yellow-50/50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400"
      : "";

  return (
    <div className={cn("flex gap-2 px-3 py-1.5 text-xs font-mono", bgClass)}>
      <span className="w-8 shrink-0 text-right text-muted-foreground">
        {diff.lineNumber}
      </span>
      <span className="w-4 shrink-0 font-bold">{prefix}</span>
      <span className="whitespace-pre-wrap break-all">
        {diff.content1 || diff.content2 || ""}
      </span>
    </div>
  );
}
