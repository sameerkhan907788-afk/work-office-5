// Local offline database using AsyncStorage. All data stays on device.
import AsyncStorage from "@react-native-async-storage/async-storage";
import uuid from "react-native-uuid";

export type FileType = "doc" | "sheet" | "slide";

export type FileMeta = {
  id: string;
  type: FileType;
  title: string;
  workspaceId?: string;
  favorite?: boolean;
  trashed?: boolean;
  createdAt: number;
  updatedAt: number;
  preview?: string;
};

export type DocContent = {
  blocks: DocBlock[];
};

export type DocBlock = {
  id: string;
  kind: "h1" | "h2" | "h3" | "p" | "ul" | "ol" | "quote" | "code" | "divider";
  text: string;
  style?: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; align?: "left" | "center" | "right"; color?: string; highlight?: string; fontSize?: number };
};

export type Cell = { v?: string | number; f?: string; style?: CellStyle };
export type CellStyle = { bold?: boolean; italic?: boolean; underline?: boolean; align?: "left" | "center" | "right"; color?: string; bg?: string; format?: "number" | "currency" | "percent" | "date" | "text" };
export type Sheet = { id: string; name: string; rows: number; cols: number; cells: Record<string, Cell>; charts?: ChartConfig[] };
export type ChartConfig = { id: string; kind: "column" | "bar" | "line" | "pie" | "doughnut" | "area" | "scatter" | "combo"; title: string; sheetId: string; range: string; x?: number; y?: number; w?: number; h?: number };
export type SheetContent = { sheets: Sheet[] };

export type SlideElement =
  | { id: string; kind: "text"; x: number; y: number; w: number; h: number; text: string; fontSize: number; bold?: boolean; italic?: boolean; color?: string; align?: "left" | "center" | "right" }
  | { id: string; kind: "shape"; x: number; y: number; w: number; h: number; shape: "rect" | "circle" | "triangle"; fill: string; stroke?: string }
  | { id: string; kind: "image"; x: number; y: number; w: number; h: number; uri: string }
  | { id: string; kind: "chart"; x: number; y: number; w: number; h: number; chartRef: string };

export type Slide = { id: string; bg: string; elements: SlideElement[]; notes?: string; layout?: string };
export type SlideContent = { slides: Slide[]; theme: SlideTheme };
export type SlideTheme = { name: string; bg: string; primary: string; secondary: string; text: string; accent: string; font: string };

export type Workspace = { id: string; name: string; color: string; createdAt: number };

const K = {
  meta: (id: string) => `office:meta:${id}`,
  content: (id: string) => `office:content:${id}`,
  fileIndex: "office:index:files",
  workspaceIndex: "office:index:workspaces",
  workspace: (id: string) => `office:workspace:${id}`,
  history: (id: string) => `office:history:${id}`,
  settings: "office:settings",
};

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: any): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[storage] write failed for ${key}`, error);
    return false;
  }
}

export const genId = () => String(uuid.v4());

export async function listFiles(): Promise<FileMeta[]> {
  const ids = await readJSON<string[]>(K.fileIndex, []);
  const metas = await Promise.all(ids.map((id) => readJSON<FileMeta | null>(K.meta(id), null)));
  return metas.filter((m): m is FileMeta => !!m).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getFile(id: string): Promise<FileMeta | null> {
  return readJSON<FileMeta | null>(K.meta(id), null);
}

export async function getContent<T = any>(id: string): Promise<T | null> {
  return readJSON<T | null>(K.content(id), null);
}

export async function saveFile(meta: FileMeta, content: any): Promise<boolean> {
  try {
    const ids = await readJSON<string[]>(K.fileIndex, []);
    if (!ids.includes(meta.id)) {
      ids.push(meta.id);
      if (!(await writeJSON(K.fileIndex, ids))) return false;
    }

    const nextMeta = { ...meta, updatedAt: Date.now() };
    // Version history is best-effort; the current document remains the source of truth.
    try {
      const hist = await readJSON<any[]>(K.history(meta.id), []);
      hist.unshift({ ts: Date.now(), content });
      await writeJSON(K.history(meta.id), hist.slice(0, 20));
    } catch (error) {
      console.warn(`[storage] history write failed for ${meta.id}`, error);
    }

    const metaSaved = await writeJSON(K.meta(meta.id), nextMeta);
    const contentSaved = await writeJSON(K.content(meta.id), content);
    if (!metaSaved || !contentSaved) {
      console.warn(`[storage] file save incomplete for ${meta.id}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[storage] file save failed for ${meta.id}`, error);
    return false;
  }
}

export async function updateMeta(id: string, patch: Partial<FileMeta>) {
  const m = await getFile(id);
  if (!m) return;
  const next = { ...m, ...patch, updatedAt: Date.now() };
  await writeJSON(K.meta(id), next);
}

export async function deleteFile(id: string) {
  await updateMeta(id, { trashed: true });
}

export async function restoreFile(id: string) {
  await updateMeta(id, { trashed: false });
}

export async function purgeFile(id: string) {
  try {
    const ids = await readJSON<string[]>(K.fileIndex, []);
    await writeJSON(K.fileIndex, ids.filter((x) => x !== id));
    await AsyncStorage.multiRemove([K.meta(id), K.content(id), K.history(id)]);
    return true;
  } catch (error) {
    console.warn("[storage] purge failed", error);
    return false;
  }
}

export async function getHistory(id: string): Promise<{ ts: number; content: any }[]> {
  return readJSON<any[]>(K.history(id), []);
}

// Workspaces
export async function listWorkspaces(): Promise<Workspace[]> {
  const ids = await readJSON<string[]>(K.workspaceIndex, []);
  const items = await Promise.all(ids.map((id) => readJSON<Workspace | null>(K.workspace(id), null)));
  return items.filter((w): w is Workspace => !!w);
}

export async function saveWorkspace(w: Workspace) {
  const ids = await readJSON<string[]>(K.workspaceIndex, []);
  if (!ids.includes(w.id)) {
    ids.push(w.id);
    await writeJSON(K.workspaceIndex, ids);
  }
  await writeJSON(K.workspace(w.id), w);
}

export async function deleteWorkspace(id: string) {
  const ids = await readJSON<string[]>(K.workspaceIndex, []);
  await writeJSON(K.workspaceIndex, ids.filter((x) => x !== id));
  await AsyncStorage.removeItem(K.workspace(id));
}

// Settings
export type AppSettings = { themeMode: "system" | "light" | "dark"; autosave: boolean; onboarded: boolean };
const defaultSettings: AppSettings = { themeMode: "system", autosave: true, onboarded: false };
export async function getSettings(): Promise<AppSettings> {
  return readJSON<AppSettings>(K.settings, defaultSettings);
}
export async function saveSettings(s: AppSettings) {
  await writeJSON(K.settings, s);
}

// factories
export function newDoc(title = "Untitled Document", workspaceId?: string): { meta: FileMeta; content: DocContent } {
  const id = genId();
  return {
    meta: { id, type: "doc", title, workspaceId, createdAt: Date.now(), updatedAt: Date.now() },
    content: { blocks: [{ id: genId(), kind: "h1", text: title }, { id: genId(), kind: "p", text: "" }] },
  };
}

export function newSheet(title = "Untitled Sheet", workspaceId?: string): { meta: FileMeta; content: SheetContent } {
  const id = genId();
  return {
    meta: { id, type: "sheet", title, workspaceId, createdAt: Date.now(), updatedAt: Date.now() },
    content: { sheets: [{ id: genId(), name: "Sheet1", rows: 100, cols: 26, cells: {}, charts: [] }] },
  };
}

export function newSlide(title = "Untitled Presentation", workspaceId?: string, theme?: SlideTheme): { meta: FileMeta; content: SlideContent } {
  const id = genId();
  const t: SlideTheme = theme ?? { name: "Modern", bg: "#FFFFFF", primary: "#FF5E00", secondary: "#1C1C1E", text: "#1C1C1E", accent: "#FF6600", font: "System" };
  return {
    meta: { id, type: "slide", title, workspaceId, createdAt: Date.now(), updatedAt: Date.now() },
    content: {
      theme: t,
      slides: [
        {
          id: genId(),
          bg: t.bg,
          elements: [
            { id: genId(), kind: "text", x: 40, y: 120, w: 640, h: 80, text: title, fontSize: 40, bold: true, color: t.primary },
            { id: genId(), kind: "text", x: 40, y: 210, w: 640, h: 40, text: "Click to edit subtitle", fontSize: 20, color: t.text },
          ],
          layout: "title",
        },
      ],
    },
  };
}
