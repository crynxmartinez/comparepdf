"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Plus, X, Key, Columns } from "lucide-react";
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
  const [keyA, setKeyA] = useState<number | null>(null);
  const [keyB, setKeyB] = useState<number | null>(null);
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [selectingPairA, setSelectingPairA] = useState<number | null>(null);

  const usedA = new Set(pairs.map((p) => p[0]));
  const usedB = new Set(pairs.map((p) => p[1]));
  if (keyA !== null) usedA.add(keyA);
  if (keyB !== null) usedB.add(keyB);

  const canConfirm = keyA !== null && keyB !== null && pairs.length > 0;

  const addPair = (aIdx: number, bIdx: number) => {
    setPairs([...pairs, [aIdx, bIdx]]);
    setSelectingPairA(null);
  };

  const removePair = (idx: number) => {
    setPairs(pairs.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">Column Mapping Required</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The two files have different column headers. Map the columns that correspond to each other.
        </p>

        {/* Step 1: Key Column Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Key className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Step 1: Select Match Key</h3>
            <span className="text-xs text-muted-foreground">(the column that identifies each item)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* File A key */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{labelA}</p>
              <div className="flex flex-wrap gap-1.5">
                {headersA.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setKeyA(keyA === i ? null : i)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                      keyA === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              {keyA !== null && (
                <p className="text-xs text-primary mt-1.5">Key: <strong>{headersA[keyA]}</strong></p>
              )}
            </div>

            {/* File B key */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{labelB}</p>
              <div className="flex flex-wrap gap-1.5">
                {headersB.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setKeyB(keyB === i ? null : i)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                      keyB === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              {keyB !== null && (
                <p className="text-xs text-primary mt-1.5">Key: <strong>{headersB[keyB]}</strong></p>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Column Pairs */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Columns className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Step 2: Map Columns to Compare</h3>
            <span className="text-xs text-muted-foreground">(select matching columns from each file)</span>
          </div>

          {/* Existing pairs */}
          {pairs.length > 0 && (
            <div className="space-y-2 mb-3">
              {pairs.map(([aIdx, bIdx], i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border">
                  <Badge variant="secondary" className="text-xs">{headersA[aIdx]}</Badge>
                  <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Badge variant="secondary" className="text-xs">{headersB[bIdx]}</Badge>
                  <button onClick={() => removePair(i)} className="ml-auto text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new pair */}
          {selectingPairA === null ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Click a column from {labelA}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {headersA.map((h, i) => {
                    const isUsed = usedA.has(i);
                    return (
                      <button
                        key={i}
                        disabled={isUsed}
                        onClick={() => setSelectingPairA(i)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                          isUsed
                            ? "opacity-30 cursor-not-allowed"
                            : "bg-background hover:bg-amber-50 hover:border-amber-300 border-border"
                        )}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Then its match from {labelB}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Selected from {labelA}:</p>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs">{headersA[selectingPairA]}</Badge>
                  <button onClick={() => setSelectingPairA(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Now click its match from {labelB}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {headersB.map((h, i) => {
                    const isUsed = usedB.has(i);
                    return (
                      <button
                        key={i}
                        disabled={isUsed}
                        onClick={() => addPair(selectingPairA, i)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                          isUsed
                            ? "opacity-30 cursor-not-allowed"
                            : "bg-background hover:bg-amber-50 hover:border-amber-300 border-border"
                        )}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary & Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-xs text-muted-foreground">
            {keyA !== null && keyB !== null ? (
              <span>Key: <strong>{headersA[keyA]}</strong> ↔ <strong>{headersB[keyB]}</strong></span>
            ) : (
              <span>Select key columns first</span>
            )}
            {pairs.length > 0 && <span className="ml-3">{pairs.length} column{pairs.length !== 1 ? "s" : ""} mapped</span>}
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
