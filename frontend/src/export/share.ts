import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { EXPORT_FILES, ExportKind } from "@/src/export/formats";

export type ExportResult = { mode: "shared" | "downloaded" | "unsupported"; uri?: string };

function safeFileName(name: string, extension: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return `${cleaned || "export"}.${extension}`;
}

function downloadOnWeb(filename: string, content: string, mimeType: string): void {
  const browserDocument = (globalThis as typeof globalThis & { document?: Document }).document;
  if (typeof Blob === "undefined" || typeof URL === "undefined" || !browserDocument) throw new Error("Browser downloads are unavailable");
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = browserDocument.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportAndShare(kind: ExportKind, baseName: string, content: string): Promise<ExportResult> {
  const fileInfo = EXPORT_FILES[kind];
  const filename = safeFileName(baseName, fileInfo.extension);

  if (Platform.OS === "web") {
    downloadOnWeb(filename, content, fileInfo.mimeType);
    return { mode: "downloaded" };
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  const available = await Sharing.isAvailableAsync();
  if (!available) return { mode: "unsupported", uri: file.uri };
  await Sharing.shareAsync(file.uri, {
    mimeType: fileInfo.mimeType,
    UTI: fileInfo.UTI,
    dialogTitle: `Share ${filename}`,
  });
  return { mode: "shared", uri: file.uri };
}
