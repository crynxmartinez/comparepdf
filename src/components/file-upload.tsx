"use client";

import { useCallback, useState } from "react";
import { Upload, X, FileText, FileSpreadsheet, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getFileType, getAcceptedExtensions } from "@/lib/parsers";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
}

function getFileIcon(fileName: string) {
  const type = getFileType(fileName);
  switch (type) {
    case "pdf":
      return <FileText className="h-8 w-8 text-red-500" />;
    case "excel":
    case "csv":
      return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    case "word":
      return <FileText className="h-8 w-8 text-blue-500" />;
    default:
      return <File className="h-8 w-8 text-muted-foreground" />;
  }
}

export function FileUpload({ label, file, onFileSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && getFileType(droppedFile.name)) {
        onFileSelect(droppedFile);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        onFileSelect(selectedFile);
      }
    },
    [onFileSelect]
  );

  return (
    <Card
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        file && "border-solid border-primary/30 bg-primary/5"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {file ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={() => onFileSelect(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          {getFileIcon(file.name)}
          <div className="text-center">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              Drag & drop or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, Excel, CSV, Word, TXT, JSON, XML
            </p>
          </div>
          <label>
            <input
              type="file"
              className="hidden"
              accept={getAcceptedExtensions()}
              onChange={handleFileInput}
            />
            <Button variant="outline" size="sm" asChild>
              <span>Browse Files</span>
            </Button>
          </label>
        </>
      )}
    </Card>
  );
}
