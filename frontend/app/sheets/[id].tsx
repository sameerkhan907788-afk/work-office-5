import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { EditorActions } from "@/src/components/editor-actions";
import { SheetGrid } from "@/src/components/sheet-grid";
import { KeyboardAvoid } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme, radius } from "@/src/theme";
import { Cell, FileMeta, Sheet, SheetContent, getContent, getFile, genId, saveFile, newSheet } from "@/src/storage/db";
import { exportContent, type ExportKind } from "@/src/export/formats";
import { exportAndShare } from "@/src/export/share";
import { cellId, colToLetter, computeCell } from "@/src/sheets/formula";


export default function SheetEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<SheetContent | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string>("");
  const [selection, setSelection] = useState<{ row: number; col: number } | null>({ row: 0, col: 0 });
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [formula, setFormula] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [sheetMenu, setSheetMenu] = useState(false);
  const [chartSheet, setChartSheet] = useState(false);
  const saveTimer = useRef<any>(null);
  const metaRef = useRef<FileMeta | null>(null);
  const contentRef = useRef<SheetContent | null>(null);

  const activeSheet = useMemo(() => content?.sheets.find((s) => s.id === activeSheetId), [content, activeSheetId]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);


  useFocusEffect(useCallback(() => {
    let mounted = true;
    const load = async () => {
      try {
        const m = await getFile(String(id));
        const c = await getContent<SheetContent>(String(id));
        const validContent = c && Array.isArray(c.sheets) && c.sheets.length > 0 && c.sheets.every((sheet) => sheet && typeof sheet.id === "string" && sheet.cells && typeof sheet.cells === "object");
        const nextContent = validContent ? c : m ? newSheet(m.title || "Untitled Spreadsheet", m.workspaceId).content : null;
        if (mounted) {
          setMeta(m);
          metaRef.current = m;
          setContent(nextContent);
          contentRef.current = nextContent;
          if (nextContent?.sheets[0]) setActiveSheetId(nextContent.sheets[0].id);
          if (m && !validContent && nextContent) {
            void saveFile(m, nextContent).then((ok) => {
              if (!ok && mounted) toast.show("Could not repair this spreadsheet locally", "error");
            });
          }
        }
      } catch (error) {
        console.warn("[sheet] load failed", error);
        if (mounted) toast.show("Could not open this spreadsheet", "error");
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id, toast]));

  useEffect(() => {
    if (!activeSheet || !selection) return;
    const c = activeSheet.cells[cellId(selection.row, selection.col)];
    setFormula(c?.f ? c.f : (c?.v != null ? String(c.v) : ""));
  }, [selection, activeSheet]);

  const scheduleSave = useCallback((next: SheetContent, nextMeta?: FileMeta) => {
    const m = nextMeta || meta;
    if (!m) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDirty(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const ok = await saveFile({ ...m, updatedAt: Date.now() }, next);
        if (!ok) {
          toast.show("Could not save spreadsheet", "error");
          return;
        }
        setDirty(false); setSavedAt(Date.now());
      } catch (error) {
        console.warn("[sheet] save failed", error);
        toast.show("Could not save spreadsheet", "error");
      }
    }, 500);
  }, [meta, toast]);

  useEffect(() => { metaRef.current = meta; }, [meta]);
  useEffect(() => { contentRef.current = content; }, [content]);

  const buildContentForSave = useCallback((): SheetContent | null => {
    const currentContent = contentRef.current || content;
    if (!currentContent) return null;
    const currentSheet = currentContent.sheets.find((sheet) => sheet.id === activeSheetId);
    if (!currentSheet || !selection) return currentContent;
    const key = cellId(selection.row, selection.col);
    const cells = { ...currentSheet.cells };
    if (formula === "") delete cells[key];
    else if (formula.startsWith("=")) cells[key] = { ...cells[key], f: formula, v: undefined };
    else {
      const number = parseFloat(formula);
      cells[key] = { ...cells[key], v: isNaN(number) ? formula : number, f: undefined };
    }
    return { ...currentContent, sheets: currentContent.sheets.map((sheet) => sheet.id === currentSheet.id ? { ...sheet, cells } : sheet) };
  }, [content, activeSheetId, selection, formula]);

  const persistNow = useCallback(async (): Promise<boolean> => {
    const currentMeta = metaRef.current || meta;
    const nextContent = buildContentForSave();
    if (!currentMeta || !nextContent) {
      toast.show("This spreadsheet is not ready to save", "error");
      return false;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const ok = await saveFile({ ...currentMeta, updatedAt: Date.now() }, nextContent);
      if (!ok) {
        toast.show("Could not save the spreadsheet. Your changes remain open.", "error");
        return false;
      }
      setContent(nextContent);
      contentRef.current = nextContent;
      setDirty(false);
      setSavedAt(Date.now());
      return true;
    } catch (error) {
      console.warn("[sheet] explicit save failed", error);
      toast.show("Could not save the spreadsheet. Please try again.", "error");
      return false;
    }
  }, [meta, buildContentForSave, toast]);

  const saveNow = useCallback(async () => {
    if (await persistNow()) toast.show("Spreadsheet saved on this device", "success");
  }, [persistNow, toast]);

  const exportSpreadsheet = useCallback(async (kind: ExportKind) => {
    if (!(await persistNow())) return;
    const currentMeta = metaRef.current || meta;
    const currentContent = contentRef.current || content;
    if (!currentMeta || !currentContent) return;
    try {
      const result = await exportAndShare(kind, currentMeta.title, exportContent(kind, currentMeta, currentContent));
      if (result.mode === "shared") toast.show("Share sheet opened", "success");
      else if (result.mode === "downloaded") toast.show("File downloaded by the browser", "success");
      else toast.show("No compatible sharing option is available on this device", "error");
    } catch (error) {
      console.warn("[sheet] export/share failed", error);
      toast.show("Could not export or share the spreadsheet", "error");
    }
  }, [persistNow, meta, content, toast]);
  const updateSheet = useCallback((sid: string, updater: (s: Sheet) => Sheet) => {
    setContent((prev) => {
      if (!prev) return prev;
      const next = { ...prev, sheets: prev.sheets.map((s) => (s.id === sid ? updater(s) : s)) };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const setCell = useCallback((row: number, col: number, patch: Partial<Cell> | null) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (s) => {
      const cells = { ...s.cells };
      const key = cellId(row, col);
      if (patch === null) delete cells[key];
      else cells[key] = { ...cells[key], ...patch };
      return { ...s, cells };
    });
  }, [activeSheet, updateSheet]);

  const commitFormula = useCallback(() => {
    if (!selection) return;
    const text = formula;
    if (text === "") setCell(selection.row, selection.col, null);
    else if (text.startsWith("=")) setCell(selection.row, selection.col, { f: text, v: undefined });
    else {
      const n = parseFloat(text);
      setCell(selection.row, selection.col, { v: isNaN(n) ? text : n, f: undefined });
    }
  }, [selection, formula, setCell]);

  const addSheet = useCallback(() => {
    if (!content) return;
    const s: Sheet = { id: genId(), name: `Sheet${content.sheets.length + 1}`, rows: 100, cols: 26, cells: {}, charts: [] };
    const next = { ...content, sheets: [...content.sheets, s] };
    setContent(next); setActiveSheetId(s.id); scheduleSave(next);
  }, [content, scheduleSave]);

  const applyFormatToSel = useCallback((patch: NonNullable<Cell["style"]>) => {
    if (!selection || !activeSheet) return;
    updateSheet(activeSheet.id, (s) => {
      const cells = { ...s.cells };
      const key = cellId(selection.row, selection.col);
      cells[key] = { ...cells[key], style: { ...(cells[key]?.style || {}), ...patch } };
      return { ...s, cells };
    });
  }, [selection, activeSheet, updateSheet]);

  const addChart = useCallback((kind: any) => {
    if (!activeSheet || !selection) return;
    const end = dragEnd || selection;
    const r1 = Math.min(selection.row, end.row), r2 = Math.max(selection.row, end.row);
    const c1 = Math.min(selection.col, end.col), c2 = Math.max(selection.col, end.col);
    const range = `${cellId(r1, c1)}:${cellId(r2, c2)}`;
    updateSheet(activeSheet.id, (s) => ({
      ...s,
      charts: [...(s.charts || []), { id: genId(), kind, title: `${kind} chart`, sheetId: s.id, range, x: 0, y: 0, w: 320, h: 200 }],
    }));
    setChartSheet(false);
    toast.show("Chart inserted", "success");
  }, [activeSheet, selection, dragEnd, updateSheet, toast]);

  if (!meta || !content || !activeSheet || !selection) {
    return <View style={[styles.center, { backgroundColor: colors.surface }]}><AppText>Spreadsheet unavailable</AppText></View>;
  }

  const displayValue = (row: number, col: number) => {
    const c = activeSheet.cells[cellId(row, col)];
    if (!c) return "";
    if (c.f) { const v = computeCell(activeSheet, cellId(row, col)); return formatValue(v, c.style); }
    return formatValue(c.v ?? "", c.style);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="back-button"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <TextInput
          testID="sheet-title"
          value={meta.title}
          onChangeText={(t) => { const m = { ...meta, title: t }; setMeta(m); if (content) scheduleSave(content, m); }}
          returnKeyType="done"
          style={[styles.titleInput, { color: colors.onSurface }]}
        />
        <TouchableOpacity onPress={() => router.push(`/sheets/tools/${id}` as any)} testID="sheet-tools">
          <Icon name="tune-variant" size={22} color={colors.brandPrimary} />
        </TouchableOpacity>
      </View>

      <EditorActions
        onSave={saveNow}
        exports={[
          { id: "csv", title: "Share CSV", subtitle: "Spreadsheet values", onPress: () => exportSpreadsheet("csv") },
          { id: "json", title: "Share JSON", subtitle: "Full workbook data", onPress: () => exportSpreadsheet("json") },
        ]}
      />

      <View style={[styles.formulaBar, { borderBottomColor: colors.border }]}>
        <View style={[styles.cellRef, { backgroundColor: colors.surfaceTertiary }]}>
          <AppText variant="label">{cellId(selection.row, selection.col)}</AppText>
        </View>
        <TextInput
          testID="formula-input"
          value={formula}
          onChangeText={setFormula}
          onBlur={commitFormula}
          onSubmitEditing={commitFormula}
          returnKeyType="done"
          placeholder="Enter value or =formula"
          placeholderTextColor={colors.muted}
          style={[styles.formulaInput, { color: colors.onSurface, backgroundColor: colors.surface }]}
        />
        <TouchableOpacity onPress={commitFormula} testID="formula-apply"><Icon name="check" size={22} color={colors.brandPrimary} /></TouchableOpacity>
      </View>

      <KeyboardAvoid style={{ flex: 1 }}>
      <SheetGrid sheet={activeSheet} selection={selection} onSelect={setSelection} displayValue={displayValue} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary }]} contentContainerStyle={{ paddingHorizontal: 12, alignItems: "center", gap: 6 }}>
        <TB icon="format-bold" onPress={() => applyFormatToSel({ bold: !activeSheet.cells[cellId(selection.row, selection.col)]?.style?.bold })} />
        <TB icon="format-italic" onPress={() => applyFormatToSel({ italic: !activeSheet.cells[cellId(selection.row, selection.col)]?.style?.italic })} />
        <TB icon="format-align-left" onPress={() => applyFormatToSel({ align: "left" })} />
        <TB icon="format-align-center" onPress={() => applyFormatToSel({ align: "center" })} />
        <TB icon="format-align-right" onPress={() => applyFormatToSel({ align: "right" })} />
        <View style={styles.divider} />
        <TB icon="numeric" onPress={() => applyFormatToSel({ format: "number" })} />
        <TB icon="currency-usd" onPress={() => applyFormatToSel({ format: "currency" })} />
        <TB icon="percent" onPress={() => applyFormatToSel({ format: "percent" })} />
        <TB icon="calendar" onPress={() => applyFormatToSel({ format: "date" })} />
        <View style={styles.divider} />
        <TB icon="chart-bar" onPress={() => setChartSheet(true)} />
        <TB icon="table-plus" onPress={addSheet} />
      </ScrollView>

      <View style={[styles.sheetTabs, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 8, alignItems: "center" }}>
          {content.sheets.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => setActiveSheetId(s.id)} testID={`sheet-tab-${s.id}`} style={[styles.tab, { backgroundColor: activeSheetId === s.id ? colors.brandPrimary : "transparent" }]}>
              <AppText style={{ color: activeSheetId === s.id ? colors.onBrandPrimary : colors.onSurface, fontWeight: "600" }}>{s.name}</AppText>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={addSheet} testID="add-sheet"><Icon name="plus" size={20} color={colors.brandPrimary} /></TouchableOpacity>
        </ScrollView>
        <AppText variant="caption" style={{ paddingHorizontal: 12 }}>{dirty ? "Unsaved changes" : "Saved"}</AppText>
      </View>
      </KeyboardAvoid>

      <BottomSheet visible={chartSheet} onClose={() => setChartSheet(false)} title="Insert chart">
        <AppText variant="muted" style={{ marginBottom: 12 }}>Selected: {cellId(selection.row, selection.col)}{dragEnd ? `:${cellId(dragEnd.row, dragEnd.col)}` : ""}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["column", "bar", "line", "pie", "doughnut", "area", "scatter", "combo"] as const).map((k) => (
            <TouchableOpacity key={k} testID={`chart-${k}`} onPress={() => addChart(k)} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, minWidth: 90, alignItems: "center", backgroundColor: colors.surface }}>
              <Icon name={chartIcon(k) as any} size={24} color={colors.brandPrimary} />
              <AppText variant="caption" style={{ marginTop: 6, textTransform: "capitalize" }}>{k}</AppText>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

function TB({ icon, onPress }: { icon: string; onPress: () => void }) {
  const { colors } = useTheme();
  return <TouchableOpacity onPress={onPress} style={{ padding: 10 }} testID={`sheet-tb-${icon}`}><Icon name={icon as any} size={20} color={colors.onSurface} /></TouchableOpacity>;
}

function chartIcon(kind: string) {
  switch (kind) {
    case "bar": return "chart-bar";
    case "column": return "chart-bar";
    case "line": return "chart-line";
    case "pie": return "chart-pie";
    case "doughnut": return "chart-donut";
    case "area": return "chart-areaspline";
    case "scatter": return "chart-scatter-plot";
    case "combo": return "chart-multiple";
    default: return "chart-bar";
  }
}

function formatValue(v: any, style?: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    const fmt = style?.format;
    if (fmt === "currency") return "$" + v.toFixed(2);
    if (fmt === "percent") return (v * 100).toFixed(2) + "%";
    if (fmt === "date") return new Date(v).toLocaleDateString();
    return Math.abs(v) < 1e-6 ? "0" : Number(v.toFixed(6)).toString();
  }
  return String(v);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  titleInput: { flex: 1, fontSize: 17, fontWeight: "600" },
  formulaBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1 },
  cellRef: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, minWidth: 44, alignItems: "center" },
  formulaInput: { flex: 1, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  rowHeader: { alignItems: "center", justifyContent: "center", borderWidth: 0.5 },
  colHeader: { alignItems: "center", justifyContent: "center", borderWidth: 0.5 },
  cell: { alignItems: "stretch", justifyContent: "center" },
  toolbar: { height: 48, borderTopWidth: 1 },
  divider: { width: 1, height: 20, backgroundColor: "#D1D1D6", marginHorizontal: 4 },
  sheetTabs: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, height: 40 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
});
