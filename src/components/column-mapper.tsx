"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColumnMapping {
  /** Which column index in File A is the match key */
  keyA: number;
  /** Which column index in File B is the match key */
  keyB: number;
  /** Pairs of column indices to compare: [fileA_col_idx, fileB_col_idx] */
  pairs: [number, number][];
}

interface ColumnMapperProps {
  headersA: string[];
  headersB: string[];
  labelA: string;
  labelB: string;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

export function ColumnMapper({
  headersA,
  headersB,
  labelA,
  labelB,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  // mappings[bIdx] = aIdx or null (which File A header is mapped to this File B header)
  const [mappings, setMappings] = useState<(number | null)[]>(
    () => headersB.map(() => null)
  );
  // Which File B row is designated as the match key
  const [keyRow, setKeyRow] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOverB, setDragOverB] = useState<number | null>(null);

  // Compute which File A indices are already used
  const usedA = new Set<number>();
  for (const aIdx of mappings) {
    if (aIdx !== null) usedA.add(aIdx);
  }

  // Compute pairs (excluding the key row)
  const pairs: [number, number][] = [];
  let keyA: number | null = null;
  let keyB: number | null = null;

  for (let bIdx = 0; bIdx < headersB.length; bIdx++) {
    const aIdx = mappings[bIdx];
    if (aIdx === null) continue;
    if (bIdx === keyRow) {
      keyA = aIdx;
      keyB = bIdx;
    } else {
      pairs.push([aIdx, bIdx]);
    }
  }

  const canConfirm = keyA !== null && keyB !== null && pairs.length > 0;

  const handleDragStart = (aIdx: number) => {
    setDragging(aIdx);
  };

  const handleDragOver = (e: React.DragEvent, bIdx: number) => {
    e.preventDefault();
    setDragOverB(bIdx);
  };

  const handleDrop = (bIdx: number) => {
    if (dragging === null) return;
    const updated = [...mappings];
    // Remove dragging from any previous slot
    for (let i = 0; i < updated.length; i++) {
      if (updated[i] === dragging) updated[i] = null;
    }
    updated[bIdx] = dragging;
    setMappings(updated);
    setDragging(null);
    setDragOverB(null);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOverB(null);
  };

  const clearMapping = (bIdx: number) => {
    const updated = [...mappings];
    // If this was the key row, unset it
    if (keyRow === bIdx) setKeyRow(null);
    updated[bIdx] = null;
    setMappings(updated);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">Column Mapping</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Drag headers from <strong>{labelA}</strong> into the drop zones next to <strong>{labelB}</strong> headers to map them.
          Then mark one row as the <strong>Match Key</strong>.
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-0 items-start">
          {/* ─── Column Headers ─── */}
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2 border-b">
            {labelB} Headers
          </div>
          <div className="pb-2 border-b" />
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2 border-b">
            Mapped {labelA} Header
          </div>

          {/* ─── Rows: one per File B header ─── */}
          {headersB.map((hB, bIdx) => {
            const mappedA = mappings[bIdx];
            const isKey = keyRow === bIdx;
            const isDropTarget = dragOverB === bIdx;

            return (
              <div key={bIdx} className="contents">
                {/* File B header name */}
                <div className={cn(
                  "flex items-center gap-2 py-2.5 px-3 border-b min-h-[44px]",
                  isKey && "bg-primary/5"
                )}>
                  <span className="text-sm font-medium">{hB}</span>
                  {isKey && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">KEY</span>
                  )}
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center py-2.5 border-b min-h-[44px]">
                  {mappedA !== null && (
                    <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>

                {/* Drop zone for File A header */}
                <div
                  className={cn(
                    "flex items-center gap-2 py-2.5 px-3 border-b min-h-[44px] rounded-r transition-colors",
                    isKey && "bg-primary/5",
                    mappedA === null && "border border-dashed border-muted-foreground/30",
                    isDropTarget && dragging !== null && "bg-amber-50 border-amber-400 dark:bg-amber-900/20",
                  )}
                  onDragOver={(e) => handleDragOver(e, bIdx)}
                  onDragLeave={() => setDragOverB(null)}
                  onDrop={() => handleDrop(bIdx)}
                >
                  {mappedA !== null ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm font-medium text-primary">{headersA[mappedA]}</span>
                      <div className="ml-auto flex items-center gap-1">
                        {!isKey && mappedA !== null && (
                          <button
                            onClick={() => {
                              setKeyRow(bIdx);
                            }}
                            className="text-[10px] text-muted-foreground hover:text-primary border rounded px-1.5 py-0.5 transition-colors"
                            title="Set as match key"
                          >
                            Set as Key
                          </button>
                        )}
                        <button
                          onClick={() => clearMapping(bIdx)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove mapping"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">
                      Drop {labelA} header here
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Draggable File A headers ─── */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {labelA} Headers — drag to map
          </p>
          <div className="flex flex-wrap gap-2">
            {headersA.map((hA, aIdx) => {
              const isUsed = usedA.has(aIdx);
              const isDraggingThis = dragging === aIdx;
              return (
                <div
                  key={aIdx}
                  draggable={!isUsed}
                  onDragStart={() => handleDragStart(aIdx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border cursor-grab active:cursor-grabbing select-none transition-all",
                    isUsed
                      ? "opacity-30 cursor-default bg-muted border-border"
                      : "bg-background hover:bg-muted border-border hover:border-primary/50 shadow-sm",
                    isDraggingThis && "opacity-50 scale-95"
                  )}
                >
                  {!isUsed && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />}
                  {hA}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Summary & Actions ─── */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t">
          <div className="text-xs text-muted-foreground">
            {keyA !== null && keyB !== null ? (
              <span>Match Key: <strong>{headersA[keyA]}</strong> ↔ <strong>{headersB[keyB]}</strong></span>
            ) : (
              <span className="text-amber-600">Map at least one pair and set a Match Key</span>
            )}
            {pairs.length > 0 && <span className="ml-3">· {pairs.length} column{pairs.length !== 1 ? "s" : ""} to compare</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button
              size="sm"
              disabled={!canConfirm}
              onClick={() => onConfirm({ keyA: keyA!, keyB: keyB!, pairs })}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1" />
              Compare with Mapping
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
