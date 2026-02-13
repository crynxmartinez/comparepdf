"use client";

export type SupportedFileType = "pdf" | "excel" | "csv" | "word" | "text";

export function getFileType(fileName: string): SupportedFileType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "xlsx":
    case "xls":
      return "excel";
    case "csv":
      return "csv";
    case "docx":
      return "word";
    case "txt":
    case "json":
    case "xml":
    case "md":
    case "log":
      return "text";
    default:
      return null;
  }
}

export function getAcceptedExtensions(): string {
  return ".pdf,.xlsx,.xls,.csv,.docx,.txt,.json,.xml,.md,.log";
}

export async function extractText(file: File): Promise<string[]> {
  const fileType = getFileType(file.name);
  switch (fileType) {
    case "pdf":
      return extractPdfText(file);
    case "excel":
      return extractExcelText(file);
    case "csv":
      return extractCsvText(file);
    case "word":
      return extractWordText(file);
    case "text":
      return extractPlainText(file);
    default:
      throw new Error(`Unsupported file type: ${file.name}`);
  }
}

async function extractPdfText(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    if (pageText.trim()) {
      lines.push(`[Page ${i}]`);
      const pageLines = pageText.split(/\n/);
      lines.push(...pageLines);
    }
  }

  return lines;
}

async function extractExcelText(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    lines.push(`[Sheet: ${sheetName}]`);
    for (const row of data) {
      if (Array.isArray(row)) {
        lines.push(row.map((cell) => String(cell ?? "")).join("\t"));
      }
    }
    lines.push("");
  }

  return lines;
}

async function extractCsvText(file: File): Promise<string[]> {
  const text = await file.text();
  return text.split(/\r?\n/);
}

async function extractWordText(file: File): Promise<string[]> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.split(/\r?\n/);
}

async function extractPlainText(file: File): Promise<string[]> {
  const text = await file.text();
  return text.split(/\r?\n/);
}
