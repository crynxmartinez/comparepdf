"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  File,
  Trash,
} from "lucide-react";
import {
  getComparisons,
  deleteComparison,
  clearAllComparisons,
  type ComparisonRecord,
} from "@/lib/db";
import { downloadReport } from "@/lib/export";
import { ReportViewer } from "@/components/report-viewer";

function getTypeIcon(fileType: string) {
  switch (fileType) {
    case "pdf":
      return <FileText className="h-4 w-4 text-red-500" />;
    case "excel":
    case "csv":
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    case "word":
      return <FileText className="h-4 w-4 text-blue-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function HistoryPage() {
  const [records, setRecords] = useState<ComparisonRecord[]>([]);
  const [selected, setSelected] = useState<ComparisonRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getComparisons();
      setRecords(data);
    } catch (e) {
      console.error("Failed to load history:", e);
      setError(String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleDelete = async (id: string) => {
    await deleteComparison(id);
    if (selected?.id === id) setSelected(null);
    await loadRecords();
  };

  const handleClearAll = async () => {
    if (confirm("Are you sure you want to delete all comparison history?")) {
      await clearAllComparisons();
      setSelected(null);
      await loadRecords();
    }
  };

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Comparison Details
            </h1>
            <p className="text-sm text-muted-foreground">
              {selected.fileNames.join(" vs ")}
            </p>
          </div>
          <Button variant="outline" onClick={() => setSelected(null)}>
            Back to History
          </Button>
        </div>
        <ReportViewer record={selected} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            View and manage your past comparisons
          </p>
        </div>
        {records.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleClearAll}>
            <Trash className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {error ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load history</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadRecords}>Retry</Button>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Loading history...
        </div>
      ) : records.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium">No comparisons yet</p>
          <p className="text-xs text-muted-foreground">
            Your comparison history will appear here
          </p>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-3">
            {records.map((record) => (
              <Card
                key={record.id}
                className="flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {getTypeIcon(record.fileType)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {record.fileNames.join(" vs ")}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {record.fileType.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(record.date).toLocaleDateString()}{" "}
                        {new Date(record.date).toLocaleTimeString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {record.summary.matchScore}% match
                      </span>
                      <span className="text-xs text-amber-600">
                        {record.summary.modified} different
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSelected(record)}
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => downloadReport(record)}
                    title="Download HTML report"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(record.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
