import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { Card } from "@/src/components/card";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { SCROLL_KEYBOARD_PROPS, dismissKeyboard } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme, radius } from "@/src/theme";
import { FileMeta, SheetContent, getContent, getFile, genId, saveFile, newDoc, newSlide } from "@/src/storage/db";
import { cellId, computeCell, parseRange } from "@/src/sheets/formula";
import * as AI from "@/src/ai/engine";

const CATEGORIES = ["AI & Formulas", "Data Intelligence", "Import & Extract", "Charts & Analysis", "Cross-App"] as const;

export default function SheetsTools() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<SheetContent | null>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("AI & Formulas");
  const [preview, setPreview] = useState<null | { title: string; text: string; apply: () => void | boolean | Promise<void | boolean> }>(null);
  const [promptSheet, setPromptSheet] = useState<null | { title: string; onSubmit: (v: string) => void }>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    (async () => {
      const m = await getFile(String(id)); const c = await getContent<SheetContent>(String(id));
      setMeta(m); setContent(c);
    })();
  }, [id]);

  const activeSheet = content?.sheets[0];

  const commitContent = useCallback(async (next: SheetContent): Promise<boolean> => {
    if (!meta) return false;
    try {
      const ok = await saveFile({ ...meta, updatedAt: Date.now() }, next);
      if (!ok) {
        toast.show("Could not apply changes to the spreadsheet", "error");
        return false;
      }
      setContent(next);
      return true;
    } catch (error) {
      console.warn("[sheets-tools] apply failed", error);
      toast.show("Could not apply changes to the spreadsheet", "error");
      return false;
    }
  }, [meta, toast]);

  const asRows = useCallback((): any[][] => {
    if (!activeSheet) return [];
    // find max row and col with content
    let maxR = -1, maxC = -1;
    for (const k of Object.keys(activeSheet.cells)) {
      const m = /^([A-Z]+)(\d+)$/.exec(k);
      if (!m) continue;
      const r = parseInt(m[2], 10) - 1;
      const col = m[1].split("").reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
      if (r > maxR) maxR = r;
      if (col > maxC) maxC = col;
    }
    const rows: any[][] = [];
    for (let r = 0; r <= maxR; r++) {
      const row: any[] = [];
      for (let c = 0; c <= maxC; c++) {
        const cell = activeSheet.cells[cellId(r, c)];
        if (!cell) { row.push(""); continue; }
        if (cell.f) row.push(computeCell(activeSheet, cellId(r, c)));
        else row.push(cell.v ?? "");
      }
      rows.push(row);
    }
    return rows;
  }, [activeSheet]);

  const applyRows = useCallback(async (rows: any[][]): Promise<boolean> => {
    if (!content || !activeSheet) return false;
    const cells: any = {};
    rows.forEach((row, r) => row.forEach((v, c) => {
      if (v !== "" && v != null) cells[cellId(r, c)] = { v: typeof v === "number" ? v : String(v) };
    }));
    const next: SheetContent = { ...content, sheets: content.sheets.map((s) => (s.id === activeSheet.id ? { ...s, cells } : s)) };
    return commitContent(next);
  }, [content, activeSheet, commitContent]);

  const tools: Record<string, { id: string; label: string; icon: string; run: () => void }[]> = {
    "AI & Formulas": [
      { id: "ai-build", label: "AI Spreadsheet Builder", icon: "auto-fix", run: () => setPromptSheet({ title: "Describe the sheet you want (e.g. monthly sales for 6 products)", onSubmit: (p) => {
        // Basic scaffolding: use keywords for headers
        const kws = AI.keywords(p, 4);
        const headers = kws.length ? ["Item", ...kws.map((k) => k[0].toUpperCase() + k.slice(1))] : ["Item", "Value", "Change", "Notes"];
        const rows = [headers, ...Array.from({ length: 8 }).map((_, i) => [`Row ${i + 1}`, ...headers.slice(1).map(() => Math.round(Math.random() * 100))])];
        setPreview({ title: "AI Sheet Builder", text: rows.map((r) => r.join("\t")).join("\n"), apply: () => applyRows(rows) });
      }})},
      { id: "formula", label: "AI Formula Builder", icon: "function", run: () => setPromptSheet({ title: "Describe formula (e.g. sum A1 to A10)", onSubmit: (p) => {
        const t = p.toLowerCase();
        let formula = "=";
        const rangeMatch = t.match(/([A-Z]+\d+)\s*(to|through|:)\s*([A-Z]+\d+)/i);
        const r = rangeMatch ? `${rangeMatch[1].toUpperCase()}:${rangeMatch[3].toUpperCase()}` : "A1:A10";
        if (t.includes("sum")) formula = `=SUM(${r})`;
        else if (t.includes("average") || t.includes("mean")) formula = `=AVERAGE(${r})`;
        else if (t.includes("count")) formula = `=COUNT(${r})`;
        else if (t.includes("max")) formula = `=MAX(${r})`;
        else if (t.includes("min")) formula = `=MIN(${r})`;
        else if (t.includes("if")) formula = `=IF(${r.split(":")[0]}>0,"yes","no")`;
        else formula = `=SUM(${r})`;
        setPreview({ title: "Formula", text: formula, apply: () => toast.show(`Copy this into the formula bar: ${formula}`, "info") });
      }})},
      { id: "doctor", label: "Formula Doctor", icon: "medical-bag", run: () => {
        if (!activeSheet) return;
        const errors: string[] = [];
        for (const k of Object.keys(activeSheet.cells)) {
          const v = computeCell(activeSheet, k);
          if (typeof v === "string" && v.startsWith("#") && v.endsWith("!")) errors.push(`${k}: ${v}`);
        }
        setPreview({ title: "Formula Doctor", text: errors.length ? errors.join("\n") : "No formula errors found.", apply: () => {} });
      }},
      { id: "explain", label: "Formula Explainer", icon: "help-circle-outline", run: () => setPromptSheet({ title: "Paste a formula to explain", onSubmit: (p) => {
        const fn = /^=?([A-Z]+)\(/.exec(p.trim().toUpperCase())?.[1] || "";
        const desc: Record<string, string> = {
          SUM: "Adds all numbers in the range.",
          AVERAGE: "Computes the mean of numeric values in the range.",
          COUNT: "Counts numeric cells in the range.",
          MAX: "Returns the largest numeric value.",
          MIN: "Returns the smallest numeric value.",
          IF: "Returns one value when the condition is true, another when false.",
          VLOOKUP: "Looks up a value in the first column and returns from a specific column.",
          ROUND: "Rounds a number to specified decimals.",
        };
        setPreview({ title: "Explanation", text: fn ? `${fn}: ${desc[fn] || "Standard function."}` : "Not a recognized function.", apply: () => {} });
      }})},
      { id: "ask", label: "Ask Your Data", icon: "database-search-outline", run: () => setPromptSheet({ title: "Ask a question (e.g. total for column A)", onSubmit: (p) => {
        const rows = asRows();
        const t = p.toLowerCase();
        const col = /column\s*([A-Z])/i.exec(p)?.[1]?.charCodeAt(0)! - 65;
        const use = !isNaN(col) ? col : 0;
        const vals = rows.slice(1).map((r) => parseFloat(String(r[use]))).filter((n) => !isNaN(n));
        let ans = "";
        if (t.includes("total") || t.includes("sum")) ans = `Sum: ${vals.reduce((a, b) => a + b, 0)}`;
        else if (t.includes("average") || t.includes("mean")) ans = `Average: ${(vals.reduce((a, b) => a + b, 0) / (vals.length || 1)).toFixed(2)}`;
        else if (t.includes("max")) ans = `Max: ${Math.max(...vals)}`;
        else if (t.includes("min")) ans = `Min: ${Math.min(...vals)}`;
        else if (t.includes("count")) ans = `Count: ${vals.length}`;
        else ans = `Values in column ${String.fromCharCode(65 + use)}: sum ${vals.reduce((a, b) => a + b, 0)}, avg ${(vals.reduce((a, b) => a + b, 0) / (vals.length || 1)).toFixed(2)}`;
        setPreview({ title: "Answer", text: ans, apply: () => {} });
      }})},
      { id: "smartfill", label: "Smart Fill", icon: "auto-fix", run: () => setPromptSheet({ title: "Describe fill pattern (e.g. numbers 1 to 20)", onSubmit: (p) => {
        const rows = asRows();
        const m = /(\d+)\s*(?:to|through|-|:)\s*(\d+)/.exec(p);
        if (m) {
          const start = parseInt(m[1]), end = parseInt(m[2]);
          const next = rows.map((r) => [...r]);
          for (let i = start; i <= end; i++) next.push([i]);
          setPreview({ title: "Smart Fill", text: `Fill with numbers ${start}..${end}`, apply: () => applyRows(next) });
        } else {
          toast.show("Try patterns like 'numbers 1 to 20'", "info");
        }
      }})},
      { id: "nl", label: "Natural-Language Edit", icon: "brain", run: () => setPromptSheet({ title: "e.g. 'highlight negative profit'", onSubmit: (p) => {
        toast.show("Natural-language editing preview: use Conditional formatting toolbar in editor", "info");
      }})},
      { id: "agent", label: "Spreadsheet Agent", icon: "robot-outline", run: () => setPromptSheet({ title: "e.g. clean, dedupe, forecast", onSubmit: (p) => {
        const rows = asRows();
        const before = rows.length;
        // dedupe
        const seen = new Set<string>();
        const clean = rows.filter((r) => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
        setPreview({ title: `Agent plan (${before - clean.length} duplicates removed)`, text: `Steps:\n1. Remove duplicate rows\n2. Trim whitespace\n3. Preview cleaned data\n\nRows: ${before} → ${clean.length}`, apply: () => applyRows(clean.map((r) => r.map((v) => typeof v === "string" ? v.trim() : v))) });
      }})},
    ],
    "Data Intelligence": [
      { id: "clean", label: "Auto Data Cleaning", icon: "broom", run: () => {
        const rows = asRows().map((r) => r.map((v) => typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v));
        setPreview({ title: "Cleaned data", text: rows.slice(0, 8).map((r) => r.join(" | ")).join("\n") + (rows.length > 8 ? "\n..." : ""), apply: () => applyRows(rows) });
      }},
      { id: "dup", label: "Duplicate Detector", icon: "content-duplicate", run: () => {
        const rows = asRows(); const dup = AI.duplicates(rows.slice(1), (r) => JSON.stringify(r));
        setPreview({ title: "Duplicates", text: dup.length ? `Rows: ${dup.map((i) => i + 2).join(", ")}` : "No duplicates found", apply: () => {} });
      }},
      { id: "miss", label: "Missing Data Detector", icon: "alert-outline", run: () => {
        const rows = asRows(); const m = AI.missing(rows);
        setPreview({ title: "Missing values", text: m.length ? m.slice(0, 30).map((x) => cellId(x.row, x.col)).join(", ") + (m.length > 30 ? "…" : "") : "No missing data", apply: () => {} });
      }},
      { id: "cat", label: "Smart Categorization", icon: "shape-outline", run: () => {
        const rows = asRows(); const cats = rows.slice(1).map((r) => AI.categorize(r.join(" "))); const counts: Record<string, number> = {};
        cats.forEach((c) => counts[c] = (counts[c] || 0) + 1);
        setPreview({ title: "Categories", text: Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("\n"), apply: () => {} });
      }},
      { id: "recon", label: "Data Reconciliation", icon: "compare-horizontal", run: () => setPromptSheet({ title: "Paste data to reconcile (tab or CSV)", onSubmit: (p) => {
        const other = AI.textToTable(p);
        const rows = asRows();
        const a = new Set(rows.slice(1).map((r) => JSON.stringify(r)));
        const b = new Set(other.slice(1).map((r) => JSON.stringify(r)));
        const only1 = [...a].filter((x) => !b.has(x)).length;
        const only2 = [...b].filter((x) => !a.has(x)).length;
        setPreview({ title: "Reconciliation", text: `Rows only here: ${only1}\nRows only there: ${only2}`, apply: () => {} });
      }})},
      { id: "detective", label: "Data Detective", icon: "magnify-scan", run: () => {
        const rows = asRows(); const numRows = rows.slice(1);
        const insights: string[] = [];
        for (let c = 0; c < (rows[0]?.length || 0); c++) {
          const nums = numRows.map((r) => parseFloat(String(r[c]))).filter((n) => !isNaN(n));
          if (nums.length > 2) {
            insights.push(`Col ${String.fromCharCode(65 + c)}: avg ${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}, min ${Math.min(...nums)}, max ${Math.max(...nums)}`);
          }
        }
        setPreview({ title: "Data Detective", text: insights.join("\n") || "No numeric columns detected", apply: () => {} });
      }},
      { id: "trend", label: "Trend Detector", icon: "chart-line", run: () => {
        const rows = asRows(); const col = 1;
        const vals = rows.slice(1).map((r) => parseFloat(String(r[col]))).filter((n) => !isNaN(n));
        const trend = AI.detectTrend(vals);
        setPreview({ title: `Trend: ${trend}`, text: `Values: ${vals.join(", ")}\n\nDetected trend: ${trend}`, apply: () => {} });
      }},
      { id: "anom", label: "Anomaly Detector", icon: "alert-decagram", run: () => {
        const rows = asRows(); const col = 1;
        const vals = rows.slice(1).map((r) => parseFloat(String(r[col]))).filter((n) => !isNaN(n));
        const idx = AI.anomalies(vals);
        setPreview({ title: "Anomalies", text: idx.length ? `Anomalous rows: ${idx.map((i) => i + 2).join(", ")}` : "No anomalies detected", apply: () => {} });
      }},
    ],
    "Import & Extract": [
      { id: "img", label: "Image → Sheet (paste OCR)", icon: "image-text", run: () => setPromptSheet({ title: "Paste OCR-extracted table text", onSubmit: (p) => {
        const rows = AI.textToTable(p);
        setPreview({ title: "From Image", text: rows.slice(0, 5).map((r) => r.join(" | ")).join("\n"), apply: () => applyRows(rows) });
      }})},
      { id: "pdf", label: "PDF → Sheet (paste table)", icon: "file-pdf-box", run: () => setPromptSheet({ title: "Paste PDF table text", onSubmit: (p) => {
        const rows = AI.textToTable(p);
        setPreview({ title: "From PDF", text: rows.slice(0, 5).map((r) => r.join(" | ")).join("\n"), apply: () => applyRows(rows) });
      }})},
      { id: "receipt", label: "Receipt → Sheet", icon: "receipt-text-outline", run: () => setPromptSheet({ title: "Paste receipt lines", onSubmit: (p) => {
        const lines = p.split(/\r?\n/).filter((l) => l.trim());
        const rows: any[][] = [["Item", "Amount"]];
        for (const l of lines) {
          const m = /^(.*?)\s+(\d+(?:\.\d+)?)$/.exec(l.trim());
          if (m) rows.push([m[1].trim(), parseFloat(m[2])]);
        }
        setPreview({ title: "Receipt", text: rows.map((r) => r.join(" | ")).join("\n"), apply: () => applyRows(rows) });
      }})},
      { id: "doc", label: "Document → Sheet", icon: "file-document-outline", run: () => setPromptSheet({ title: "Paste document text", onSubmit: (p) => {
        const rows = AI.textToTable(p);
        if (!rows.length) { toast.show("Couldn't detect a table", "error"); return; }
        setPreview({ title: "From Doc", text: rows.slice(0, 5).map((r) => r.join(" | ")).join("\n"), apply: () => applyRows(rows) });
      }})},
    ],
    "Charts & Analysis": [
      { id: "chart", label: "AI Chart Builder", icon: "chart-bar", run: () => {
        const rows = asRows();
        if (rows.length < 2) { toast.show("Add some data first", "info"); return; }
        const suggestions = AI.suggestChart(rows[0].map(String), rows.slice(1));
        setPreview({ title: "Chart suggestions", text: suggestions.map((s) => `• ${s.kind}: ${s.reason}`).join("\n"), apply: () => { toast.show("Use the chart icon in the toolbar to insert", "info"); } });
      }},
      { id: "dash", label: "Auto Dashboard", icon: "view-dashboard-outline", run: () => {
        const rows = asRows();
        if (!content || !activeSheet || rows.length < 2) { toast.show("Need data first", "info"); return; }
        // Insert 3 charts
        const range = `A1:${String.fromCharCode(65 + (rows[0].length - 1))}${rows.length}`;
        const charts = [
          { id: genId(), kind: "column" as const, title: "Column", sheetId: activeSheet.id, range },
          { id: genId(), kind: "line" as const, title: "Line", sheetId: activeSheet.id, range },
          { id: genId(), kind: "pie" as const, title: "Pie", sheetId: activeSheet.id, range },
        ];
        const next: SheetContent = { ...content, sheets: content.sheets.map((s) => s.id === activeSheet.id ? { ...s, charts: [...(s.charts || []), ...charts] } : s) };
        commitContent(next);
        toast.show("Dashboard created", "success");
      }},
      { id: "ce", label: "Chart Explainer", icon: "help-circle-outline", run: () => {
        const rows = asRows(); const nums = rows.slice(1).map((r) => parseFloat(String(r[1]))).filter((n) => !isNaN(n));
        const trend = AI.detectTrend(nums);
        setPreview({ title: "Explanation", text: `Trend: ${trend}\nRange: ${Math.min(...nums)} to ${Math.max(...nums)}\nAverage: ${(nums.reduce((a, b) => a + b, 0) / (nums.length || 1)).toFixed(2)}`, apply: () => {} });
      }},
      { id: "forecast", label: "Offline Forecasting", icon: "trending-up", run: () => {
        const rows = asRows(); const vals = rows.slice(1).map((r) => parseFloat(String(r[1]))).filter((n) => !isNaN(n));
        const f = AI.linearForecast(vals, 4);
        setPreview({ title: "Forecast (next 4 periods)", text: f.map((v, i) => `Period ${vals.length + i + 1}: ${v.toFixed(2)}`).join("\n"), apply: () => {
          const next = rows.map((r) => [...r]);
          f.forEach((v, i) => next.push([`Forecast ${i + 1}`, +v.toFixed(2)]));
          applyRows(next);
        }});
      }},
      { id: "whatif", label: "What-if Simulator", icon: "swap-vertical-variant", run: () => setPromptSheet({ title: "Multiplier for column B (e.g. 1.10 for +10%)", onSubmit: (p) => {
        const m = parseFloat(p);
        if (isNaN(m)) { toast.show("Enter a number", "error"); return; }
        const rows = asRows();
        const next = rows.map((r, i) => i === 0 ? r : r.map((v, c) => c === 1 && !isNaN(parseFloat(String(v))) ? +(parseFloat(String(v)) * m).toFixed(2) : v));
        setPreview({ title: `Scaled ${m}x`, text: next.slice(0, 5).map((r) => r.join(" | ")).join("\n"), apply: () => applyRows(next) });
      }})},
      { id: "scen", label: "Scenario Manager", icon: "sitemap-outline", run: () => setPreview({ title: "Scenarios", text: "Save current sheet, apply Optimistic (+10%), Pessimistic (-10%). Use What-if Simulator to preview.", apply: () => {} })},
      { id: "pivot", label: "AI Pivot Builder", icon: "table-pivot", run: () => setPromptSheet({ title: "Group by column (A/B/C) and sum which column", onSubmit: (p) => {
        const rows = asRows();
        const groupCol = p.trim().toUpperCase().charCodeAt(0) - 65 || 0;
        const sumCol = 1;
        const acc: Record<string, number> = {};
        rows.slice(1).forEach((r) => {
          const g = String(r[groupCol]);
          const v = parseFloat(String(r[sumCol]));
          if (!isNaN(v)) acc[g] = (acc[g] || 0) + v;
        });
        const out = [["Group", "Total"], ...Object.entries(acc).map(([k, v]) => [k, v])];
        setPreview({ title: "Pivot", text: out.map((r) => r.join(" | ")).join("\n"), apply: () => applyRows(out) });
      }})},
    ],
    "Cross-App": [
      { id: "report", label: "Sheet → Report", icon: "file-document-outline", run: async () => {
        const rows = asRows();
        if (!rows.length) { toast.show("Add data first", "info"); return; }
        const { meta: dm, content: dc } = newDoc(`${meta?.title || "Sheet"} — Report`, meta?.workspaceId);
        dc.blocks = [
          { id: genId(), kind: "h1", text: dm.title },
          { id: genId(), kind: "p", text: `Rows: ${rows.length - 1}. Columns: ${rows[0]?.length || 0}.` },
          { id: genId(), kind: "h2", text: "Summary" },
          { id: genId(), kind: "p", text: `Detected trend: ${AI.detectTrend(rows.slice(1).map((r) => parseFloat(String(r[1]))).filter((n) => !isNaN(n)))}.` },
          { id: genId(), kind: "h2", text: "Data" },
          { id: genId(), kind: "p", text: rows.slice(0, 10).map((r) => r.join(" | ")).join("\n") },
        ];
        await saveFile(dm, dc);
        toast.show("Report created", "success");
        router.push(`/docs/${dm.id}` as any);
      }},
      { id: "slides", label: "Sheet → Slides", icon: "presentation", run: async () => {
        const rows = asRows();
        const { meta: sm, content: sc } = newSlide(`${meta?.title || "Sheet"} — Slides`, meta?.workspaceId);
        const trend = AI.detectTrend(rows.slice(1).map((r) => parseFloat(String(r[1]))).filter((n) => !isNaN(n)));
        sc.slides.push({ id: genId(), bg: sc.theme.bg, layout: "content", elements: [
          { id: genId(), kind: "text", x: 40, y: 40, w: 640, h: 40, text: "Key insights", fontSize: 26, bold: true, color: sc.theme.primary },
          { id: genId(), kind: "text", x: 40, y: 110, w: 640, h: 240, text: `Rows: ${rows.length - 1}\nColumns: ${rows[0]?.length || 0}\nTrend: ${trend}`, fontSize: 18, color: sc.theme.text },
        ]});
        await saveFile(sm, sc);
        toast.show("Slides created", "success");
        router.push(`/slides/${sm.id}` as any);
      }},
      { id: "wsintel", label: "Workspace Intelligence", icon: "graph-outline", run: () => router.push("/search" as any) },
    ],
  };

  const applyPreview = useCallback(async () => {
    if (!preview) return;
    try {
      const result = await preview.apply();
      if (result === false) return;
      setPreview(null);
    } catch (error) {
      console.warn("[sheets-tools] preview apply failed", error);
      toast.show("Could not apply changes", "error");
    }
  }, [preview, toast]);

  const active = tools[category] || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="tools-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Sheets Tools</AppText>
        <TouchableOpacity onPress={() => setPromptSheet({ title: "AI Command (e.g. clean, forecast, dashboard)", onSubmit: (p) => {
          const c = p.toLowerCase();
          if (c.includes("clean")) tools["Data Intelligence"][0].run();
          else if (c.includes("forecast")) tools["Charts & Analysis"][3].run();
          else if (c.includes("dashboard")) tools["Charts & Analysis"][1].run();
          else if (c.includes("duplicate")) tools["Data Intelligence"][1].run();
          else if (c.includes("chart")) tools["Charts & Analysis"][0].run();
          else if (c.includes("report")) tools["Cross-App"][0].run();
          else toast.show("Try: clean, forecast, dashboard, duplicate, chart, report", "info");
        }})} testID="ai-command"><Icon name="star-four-points" size={22} color={colors.brandPrimary} /></TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 56 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c} testID={`cat-${c}`} onPress={() => setCategory(c)} style={[styles.chip, { backgroundColor: category === c ? colors.brandPrimary : colors.surfaceSecondary, borderColor: colors.border, flexShrink: 0 }]}>
            <AppText style={{ color: category === c ? colors.onBrandPrimary : colors.onSurface, fontSize: 13, fontWeight: "600" }}>{c}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}>
        {active.map((t) => (
          <TouchableOpacity key={t.id} testID={`tool-${t.id}`} onPress={t.run} activeOpacity={0.85}>
            <Card style={{ padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={t.icon as any} size={22} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}><AppText variant="title">{t.label}</AppText></View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <BottomSheet visible={!!preview} onClose={() => setPreview(null)} title={preview?.title || ""}>
        <ScrollView style={{ maxHeight: 320 }}><AppText style={{ fontFamily: "monospace" }}>{preview?.text}</AppText></ScrollView>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button title="Close" kind="secondary" onPress={() => setPreview(null)} style={{ flex: 1 }} testID="preview-cancel" />
          <Button title="Apply" onPress={applyPreview} style={{ flex: 1 }} testID="preview-apply" />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!promptSheet} onClose={() => { setPromptSheet(null); setPrompt(""); }} title={promptSheet?.title}>
        <TextInput
          testID="ai-prompt-input"
          value={prompt} onChangeText={setPrompt} multiline
          placeholder="Type here" placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 80, color: colors.onSurface, textAlignVertical: "top" }}
        />
        <Button title="Run" icon="play" onPress={() => { const cb = promptSheet?.onSubmit; dismissKeyboard(); setPromptSheet(null); setPrompt(""); cb?.(prompt); }} style={{ marginTop: 12 }} testID="ai-prompt-run" />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
});
