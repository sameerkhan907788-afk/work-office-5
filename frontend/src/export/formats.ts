import { computeCell } from "@/src/sheets/formula";
import { DocContent, FileMeta, SheetContent, SlideContent } from "@/src/storage/db";

export type ExportKind = "txt" | "html" | "csv" | "json";

type ExportFile = { extension: string; mimeType: string; UTI: string };

export const EXPORT_FILES: Record<ExportKind, ExportFile> = {
  txt: { extension: "txt", mimeType: "text/plain", UTI: "public.plain-text" },
  html: { extension: "html", mimeType: "text/html", UTI: "public.html" },
  csv: { extension: "csv", mimeType: "text/csv", UTI: "public.comma-separated-values-text" },
  json: { extension: "json", mimeType: "application/json", UTI: "public.json" },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/\"/g, "\"\"")}"`;
}

function htmlDocument(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}

export function documentToTxt(meta: FileMeta, content: DocContent): string {
  const lines = content.blocks.map((block) => {
    const prefix = block.kind === "ul" ? "• " : block.kind === "ol" ? "1. " : block.kind === "divider" ? "---" : "";
    return `${prefix}${block.text}`;
  });
  return [meta.title, "", ...lines].join("\n");
}

export function documentToHtml(meta: FileMeta, content: DocContent): string {
  const body = [`<h1>${escapeHtml(meta.title)}</h1>`, ...content.blocks.map((block) => {
    if (block.kind === "divider") return "<hr>";
    const text = escapeHtml(block.text).replace(/\n/g, "<br>");
    if (block.kind === "h1" || block.kind === "h2" || block.kind === "h3") return `<${block.kind}>${text}</${block.kind}>`;
    if (block.kind === "ul") return `<p>• ${text}</p>`;
    if (block.kind === "ol") return `<p>1. ${text}</p>`;
    if (block.kind === "quote") return `<blockquote>${text}</blockquote>`;
    if (block.kind === "code") return `<pre>${text}</pre>`;
    return `<p>${text}</p>`;
  })].join("\n");
  return htmlDocument(meta.title, body);
}

function usedBounds(sheet: SheetContent["sheets"][number]): { rows: number; cols: number } {
  let maxRow = -1;
  let maxCol = -1;
  Object.keys(sheet.cells).forEach((key) => {
    const match = /^([A-Z]+)(\d+)$/.exec(key);
    if (!match) return;
    const col = match[1].split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, Number(match[2]) - 1);
  });
  return { rows: Math.max(0, maxRow + 1), cols: Math.max(0, maxCol + 1) };
}

function sheetRows(sheet: SheetContent["sheets"][number]): unknown[][] {
  const bounds = usedBounds(sheet);
  return Array.from({ length: bounds.rows }, (_, row) => Array.from({ length: bounds.cols }, (_, col) => {
    const cell = sheet.cells[`${String.fromCharCode(65 + col)}${row + 1}`];
    if (!cell) return "";
    if (cell.f) {
      try { return computeCell(sheet, `${String.fromCharCode(65 + col)}${row + 1}`); } catch { return cell.f; }
    }
    return cell.v ?? "";
  }));
}

export function spreadsheetToCsv(content: SheetContent): string {
  const rows: unknown[][] = [];
  content.sheets.forEach((sheet, index) => {
    if (index > 0) rows.push([]);
    rows.push([`Sheet: ${sheet.name}`]);
    rows.push(...sheetRows(sheet));
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function spreadsheetToJson(content: SheetContent): string {
  return JSON.stringify(content, null, 2);
}

export function presentationToJson(content: SlideContent): string {
  return JSON.stringify(content, null, 2);
}

export function presentationToHtml(meta: FileMeta, content: SlideContent): string {
  const slides = content.slides.map((slide, index) => {
    const elements = slide.elements.map((element) => {
      if (element.kind === "text") return `<div style="font-size:${element.fontSize}px;font-weight:${element.bold ? "700" : "400"};color:${escapeHtml(element.color || content.theme.text)};text-align:${element.align || "left"}">${escapeHtml(element.text).replace(/\n/g, "<br>")}</div>`;
      return `<div>${escapeHtml(element.kind)}</div>`;
    }).join("\n");
    return `<section style="background:${escapeHtml(slide.bg)};padding:40px;margin:24px 0;min-height:320px"><h2>Slide ${index + 1}</h2>${elements}${slide.notes ? `<aside><strong>Notes:</strong> ${escapeHtml(slide.notes)}</aside>` : ""}</section>`;
  }).join("\n");
  return htmlDocument(meta.title, `<h1>${escapeHtml(meta.title)}</h1>${slides}`);
}

export function exportContent(kind: ExportKind, meta: FileMeta, content: DocContent | SheetContent | SlideContent): string {
  if (meta.type === "doc") return kind === "txt" ? documentToTxt(meta, content as DocContent) : documentToHtml(meta, content as DocContent);
  if (meta.type === "sheet") return kind === "csv" ? spreadsheetToCsv(content as SheetContent) : spreadsheetToJson(content as SheetContent);
  return kind === "json" ? presentationToJson(content as SlideContent) : presentationToHtml(meta, content as SlideContent);
}
