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
import { useTheme, spacing, radius } from "@/src/theme";
import { DocContent, FileMeta, getContent, getFile, genId, saveFile, newSheet, newSlide } from "@/src/storage/db";
import * as AI from "@/src/ai/engine";

type ToolAction = { id: string; label: string; icon: string; run: () => void | Promise<void> };

const CATEGORIES = ["AI & Writing", "Document Intelligence", "Conversion", "Productivity", "Collaboration"] as const;

export default function DocsTools() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<DocContent | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewApply, setPreviewApply] = useState<null | (() => void)>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("AI & Writing");

  const [aiPromptOpen, setAiPromptOpen] = useState<null | { title: string; onSubmit: (p: string) => void }>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    (async () => {
      const m = await getFile(String(id)); const c = await getContent<DocContent>(String(id));
      setMeta(m); setContent(c);
    })();
  }, [id]);

  const allText = useCallback(() => (content?.blocks || []).map((b) => b.text).join("\n"), [content]);

  const applyBlocks = useCallback(async (text: string, prepend?: string) => {
    if (!meta || !content) return;
    const blocks = text.split(/\n\n+/).map((p) => ({ id: genId(), kind: "p" as const, text: p.trim() })).filter((b) => b.text);
    const nextContent: DocContent = prepend ? { blocks: [{ id: genId(), kind: "h2", text: prepend }, ...blocks, ...content.blocks] } : { blocks };
    setContent(nextContent);
    await saveFile({ ...meta, updatedAt: Date.now() }, nextContent);
  }, [meta, content]);

  const replaceAll = useCallback(async (text: string) => {
    if (!meta) return;
    const blocks = text.split(/\n\n+/).map((p) => ({ id: genId(), kind: "p" as const, text: p.trim() })).filter((b) => b.text);
    const nextContent: DocContent = { blocks: blocks.length ? blocks : [{ id: genId(), kind: "p", text: "" }] };
    setContent(nextContent);
    await saveFile({ ...meta, updatedAt: Date.now() }, nextContent);
  }, [meta]);

  const preview = (title: string, text: string, apply: () => void) => {
    setPreviewTitle(title); setPreviewText(text); setPreviewApply(() => apply);
  };

  const tools: Record<string, ToolAction[]> = {
    "AI & Writing": [
      { id: "ai-builder", label: "AI Document Builder", icon: "auto-fix", run: () => setAiPromptOpen({ title: "Build a document about…", onSubmit: (p) => {
        const kws = AI.keywords(p, 6);
        const outline = ["Introduction", "Background", "Key Points", "Analysis", "Conclusion"];
        const text = outline.map((s) => `## ${s}\n\nThis section covers ${s.toLowerCase()} of ${p}. Focus areas include ${kws.slice(0,3).join(", ") || "the main topic"}.`).join("\n\n");
        preview("AI Document Builder", text, () => { replaceAll(text.replace(/^## /gm, "")); toast.show("Document generated", "success"); });
      }}) },
      { id: "rewrite", label: "AI Writing & Rewriting", icon: "pencil-outline", run: () => {
        const improved = AI.rewrite(allText(), "improve");
        preview("Improved writing", improved, () => { replaceAll(improved); toast.show("Rewritten", "success"); });
      }},
      { id: "chat", label: "Document Chat", icon: "message-processing-outline", run: () => setAiPromptOpen({ title: "Ask about your document", onSubmit: (p) => {
        const t = allText(); const sents = AI.tokenizeSentences(t);
        const q = p.toLowerCase();
        const hits = sents.filter((s) => q.split(" ").some((w) => w.length > 2 && s.toLowerCase().includes(w))).slice(0, 5);
        const answer = hits.length ? hits.join(" ") : "I couldn't find relevant content in this document.";
        preview("Document Chat", answer, () => applyBlocks(`Q: ${p}\n\nA: ${answer}`, "Chat"));
      }})},
      { id: "notes", label: "Notes → Document", icon: "note-text-outline", run: () => setAiPromptOpen({ title: "Paste your notes", onSubmit: (p) => {
        const paragraphs = AI.tokenizeSentences(p).reduce<string[]>((acc, s, i) => { if (i % 2 === 0) acc.push(s); else acc[acc.length - 1] += " " + s; return acc; }, []);
        const text = paragraphs.join("\n\n");
        preview("Notes → Document", text, () => replaceAll(text));
      }})},
      { id: "voice", label: "Voice → Document", icon: "microphone-outline", run: () => { toast.show("Speech recognition needs a device build — paste transcribed text via Notes → Document", "info"); }},
      { id: "summarize", label: "Document Summarizer", icon: "text-short", run: () => {
        const s = AI.summarize(allText(), 4);
        preview("Summary", s, () => applyBlocks(s, "Summary"));
      }},
      { id: "grammar", label: "Grammar & Spelling", icon: "spellcheck", run: () => {
        const { fixed, changes } = AI.grammarFix(allText());
        preview(`Grammar (${changes} fixes)`, fixed, () => { replaceAll(fixed); toast.show(`${changes} fixes applied`, "success"); });
      }},
      { id: "tone", label: "Tone & Style", icon: "human-greeting-variant", run: () => setAiPromptOpen({ title: "Tone: professional/friendly/concise/formal/casual", onSubmit: (p) => {
        const t = AI.changeTone(allText(), (p.trim().toLowerCase() as any) || "professional");
        preview("Tone changed", t, () => replaceAll(t));
      }})},
      { id: "translate", label: "Translate", icon: "translate", run: () => setAiPromptOpen({ title: "Language code: es, fr, or hi", onSubmit: (p) => {
        const code = (p.trim().toLowerCase() as any) || "es";
        const { translated, coverage } = AI.translate(allText(), code);
        preview(`Translation (${Math.round(coverage * 100)}% covered)`, translated, () => replaceAll(translated));
      }})},
    ],
    "Document Intelligence": [
      { id: "outline", label: "Automatic Outline", icon: "format-list-bulleted-square", run: () => {
        const points = AI.outline(allText(), 8);
        preview("Outline", points.map((p) => `• ${p}`).join("\n"), () => applyBlocks(points.map((p) => `• ${p}`).join("\n\n"), "Outline"));
      }},
      { id: "toc", label: "Table of Contents", icon: "format-list-numbered", run: () => {
        const headings = (content?.blocks || []).filter((b) => b.kind === "h1" || b.kind === "h2" || b.kind === "h3");
        const toc = headings.map((h, i) => `${i + 1}. ${h.text}`).join("\n");
        preview("Table of Contents", toc || "No headings found — add H1/H2/H3 in the toolbar.", () => applyBlocks(toc, "Contents"));
      }},
      { id: "compare", label: "Consistency Checker", icon: "check-decagram-outline", run: () => {
        const issues = AI.checkConsistency((content?.blocks || []).map((b) => ({ kind: b.kind, text: b.text })));
        preview("Consistency Report", issues.length ? issues.map((i) => `• ${i}`).join("\n") : "No consistency issues detected.", () => applyBlocks(issues.length ? issues.map((i) => `• ${i}`).join("\n\n") : "No consistency issues detected.", "Consistency"));
      }},
      { id: "compare2", label: "Document Comparison", icon: "compare", run: () => setAiPromptOpen({ title: "Paste text to compare with this document", onSubmit: (p) => {
        const a = new Set(AI.keywords(allText(), 40));
        const b = new Set(AI.keywords(p, 40));
        const shared = [...a].filter((x) => b.has(x));
        const onlyA = [...a].filter((x) => !b.has(x));
        const onlyB = [...b].filter((x) => !a.has(x));
        const rep = `Shared topics: ${shared.join(", ") || "none"}\nOnly in this doc: ${onlyA.join(", ") || "none"}\nOnly in pasted text: ${onlyB.join(", ") || "none"}`;
        preview("Comparison", rep, () => applyBlocks(rep, "Comparison"));
      }})},
      { id: "facts", label: "Fact / Claim Finder", icon: "shield-check-outline", run: () => {
        const claims = AI.tokenizeSentences(allText()).filter((s) => /\d/.test(s) || /\b(is|are|will|must|should)\b/i.test(s)).slice(0, 10);
        const out = claims.length ? claims.map((c) => `• ${c}`).join("\n") : "No factual claims detected.";
        preview("Claims", out, () => applyBlocks(out, "Claims"));
      }},
      { id: "search", label: "Workspace-wide Search", icon: "database-search-outline", run: () => router.push("/search" as any) },
    ],
    "Conversion": [
      { id: "pdf-in", label: "PDF → Document (paste text)", icon: "file-pdf-box", run: () => setAiPromptOpen({ title: "Paste PDF text extract", onSubmit: (p) => preview("From PDF", p, () => replaceAll(p)) })},
      { id: "img-ocr", label: "Image → Text (paste OCR)", icon: "image-text", run: () => setAiPromptOpen({ title: "Paste OCR text from image", onSubmit: (p) => preview("From Image", p, () => replaceAll(p)) })},
      { id: "to-sheet", label: "Document → Sheet", icon: "table", run: async () => {
        const tables = AI.textToTable(allText());
        const { meta: sm, content: sc } = newSheet(`${meta?.title || "Document"} — Sheet`, meta?.workspaceId);
        if (tables.length) {
          const sheet = sc.sheets[0];
          tables.forEach((row, r) => row.forEach((val, c) => { sheet.cells[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: val }; }));
        }
        await saveFile(sm, sc);
        toast.show("Sheet created", "success");
        router.push(`/sheets/${sm.id}` as any);
      }},
      { id: "to-slide", label: "Document → Slides", icon: "presentation", run: async () => {
        const heads = (content?.blocks || []).filter((b) => b.kind === "h1" || b.kind === "h2");
        const outline = heads.length ? heads.map((h) => h.text) : AI.outline(allText(), 6);
        const { meta: sm, content: sc } = newSlide(`${meta?.title || "Document"} — Slides`, meta?.workspaceId);
        outline.forEach((h) => {
          sc.slides.push({ id: genId(), bg: sc.theme.bg, layout: "content", elements: [
            { id: genId(), kind: "text", x: 40, y: 40, w: 640, h: 40, text: h, fontSize: 26, bold: true, color: sc.theme.primary },
            { id: genId(), kind: "text", x: 40, y: 100, w: 640, h: 240, text: "•  " + AI.summarize(h, 1), fontSize: 16, color: sc.theme.text },
          ]});
        });
        await saveFile(sm, sc);
        toast.show("Slides created", "success");
        router.push(`/slides/${sm.id}` as any);
      }},
    ],
    "Productivity": [
      { id: "tables", label: "Smart Tables", icon: "table", run: () => {
        const rows = AI.textToTable(allText());
        const out = rows.length ? rows.map((r) => "| " + r.join(" | ") + " |").join("\n") : "No tabular data detected.";
        preview("Table detected", out, () => applyBlocks(out, "Table"));
      }},
      { id: "checklist", label: "Document → Checklist", icon: "checkbox-marked-outline", run: () => {
        const tasks = AI.extractTasks(allText());
        const out = tasks.length ? tasks.map((t) => `☐ ${t}`).join("\n") : "No tasks detected. Use bullets or 'TODO:' lines.";
        preview("Checklist", out, () => applyBlocks(out, "Checklist"));
      }},
      { id: "tasks", label: "Document → Tasks", icon: "clipboard-list-outline", run: () => {
        const tasks = AI.extractTasks(allText());
        const out = tasks.length ? tasks.map((t, i) => `${i + 1}. [ ] ${t}`).join("\n") : "No tasks detected.";
        preview("Tasks", out, () => applyBlocks(out, "Tasks"));
      }},
      { id: "minutes", label: "Meeting Notes → Minutes", icon: "account-group-outline", run: () => {
        const t = allText();
        const s = AI.summarize(t, 4);
        const tasks = AI.extractTasks(t);
        const out = `Attendees:\n(add here)\n\nAgenda:\n${AI.outline(t, 4).map((p) => `• ${p}`).join("\n")}\n\nSummary:\n${s}\n\nAction Items:\n${tasks.map((x) => `☐ ${x}`).join("\n") || "None"}`;
        preview("Minutes", out, () => replaceAll(out));
      }},
      { id: "sr", label: "Smart Search & Replace", icon: "find-replace", run: () => router.push(`/docs/${id}` as any) },
      { id: "auto", label: "Auto Formatting", icon: "auto-fix", run: () => {
        const t = AI.grammarFix(allText()).fixed;
        // Ensure paragraphs separated properly
        const clean = t.replace(/\n{3,}/g, "\n\n");
        preview("Auto Formatted", clean, () => replaceAll(clean));
      }},
      { id: "cite", label: "Citation Manager", icon: "bookmark-outline", run: () => setAiPromptOpen({ title: "Add citation (Author, Year, Title)", onSubmit: (p) => applyBlocks(`[${p}]`, "Citation") })},
      { id: "tpl", label: "Template Generator", icon: "file-multiple-outline", run: () => setAiPromptOpen({ title: "Template type: report / letter / memo / resume", onSubmit: (p) => {
        const key = p.toLowerCase();
        const map: Record<string, string> = {
          report: "Executive Summary\n\nBackground\n\nFindings\n\nAnalysis\n\nRecommendations\n\nAppendix",
          letter: "Sender\n\nDate\n\nRecipient\n\nSubject\n\nGreeting\n\nBody\n\nClosing",
          memo: "TO:\nFROM:\nDATE:\nSUBJECT:\n\nSummary\n\nDiscussion\n\nAction",
          resume: "Full Name\nEmail | Phone | Location\n\nSummary\n\nExperience\n\nEducation\n\nSkills",
        };
        const t = map[key] || map.report;
        preview(`Template: ${key || "report"}`, t, () => replaceAll(t));
      }})},
    ],
    "Collaboration": [
      { id: "history", label: "Version History", icon: "history", run: () => router.push(`/history/${id}` as any) },
      { id: "comments", label: "Comments (inline)", icon: "comment-text-outline", run: () => setAiPromptOpen({ title: "Add a comment for the current version", onSubmit: (p) => applyBlocks(`Comment: ${p}`, "Comments") })},
      { id: "agent", label: "Document Agent", icon: "robot-outline", run: () => setAiPromptOpen({ title: "Ask the agent (summarize / rewrite / outline / to slides)", onSubmit: (p) => {
        const cmd = p.toLowerCase();
        if (cmd.includes("summar")) { const s = AI.summarize(allText(), 5); preview("Agent: Summary", s, () => applyBlocks(s, "Summary")); }
        else if (cmd.includes("rewrite") || cmd.includes("improve")) { const t = AI.rewrite(allText(), "improve"); preview("Agent: Rewrite", t, () => replaceAll(t)); }
        else if (cmd.includes("outline")) { const o = AI.outline(allText(), 8); preview("Agent: Outline", o.map((x)=>`• ${x}`).join("\n"), () => applyBlocks(o.map((x)=>`• ${x}`).join("\n\n"), "Outline")); }
        else if (cmd.includes("slide")) { toast.show("Use Document → Slides in Conversion", "info"); }
        else { const s = AI.summarize(allText(), 3); preview("Agent: Best guess", s, () => applyBlocks(s, "Result")); }
      }})},
    ],
  };

  const activeTools = tools[category] || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="tools-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Docs Tools</AppText>
        <TouchableOpacity onPress={() => setAiPromptOpen({ title: "AI Command Center", onSubmit: (p) => {
          const c = p.toLowerCase();
          if (c.includes("summar")) tools["AI & Writing"][5].run();
          else if (c.includes("rewrite")) tools["AI & Writing"][1].run();
          else if (c.includes("outline")) tools["Document Intelligence"][0].run();
          else if (c.includes("slide")) tools["Conversion"][3].run();
          else if (c.includes("checklist")) tools["Productivity"][1].run();
          else toast.show("Command not recognized. Try: summarize, rewrite, outline, to slides", "info");
        }})} testID="ai-command">
          <Icon name="star-four-points" size={22} color={colors.brandPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 56 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c} testID={`cat-${c}`} onPress={() => setCategory(c)} style={[styles.chip, { backgroundColor: category === c ? colors.brandPrimary : colors.surfaceSecondary, borderColor: colors.border, flexShrink: 0 }]}>
            <AppText style={{ color: category === c ? colors.onBrandPrimary : colors.onSurface, fontSize: 13, fontWeight: "600" }}>{c}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}>
        {activeTools.map((t) => (
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

      <BottomSheet visible={!!previewTitle} onClose={() => { setPreviewTitle(null); setPreviewApply(null); }} title={previewTitle || ""}>
        <ScrollView style={{ maxHeight: 320 }}><AppText>{previewText}</AppText></ScrollView>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button title="Cancel" kind="secondary" onPress={() => { setPreviewTitle(null); setPreviewApply(null); }} style={{ flex: 1 }} testID="preview-cancel" />
          <Button title="Apply" icon="check" onPress={() => { previewApply?.(); setPreviewTitle(null); setPreviewApply(null); }} style={{ flex: 1 }} testID="preview-apply" />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!aiPromptOpen} onClose={() => { setAiPromptOpen(null); setPrompt(""); }} title={aiPromptOpen?.title}>
        <TextInput
          testID="ai-prompt-input"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="Type here"
          placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 80, color: colors.onSurface, textAlignVertical: "top" }}
        />
        <Button title="Run" icon="play" onPress={() => { const cb = aiPromptOpen?.onSubmit; dismissKeyboard(); setAiPromptOpen(null); setPrompt(""); cb?.(prompt); }} style={{ marginTop: 12 }} testID="ai-prompt-run" />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
});
