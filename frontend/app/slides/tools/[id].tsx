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
import { FileMeta, SlideContent, Slide, getContent, getFile, genId, saveFile, newDoc } from "@/src/storage/db";
import * as AI from "@/src/ai/engine";
import { SLIDE_THEMES, TEMPLATES } from "@/src/slides/templates";

const CATEGORIES = ["AI Presentation", "Content & Visuals", "Coaching", "Design & Themes", "Conversion"] as const;

export default function SlidesTools() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<SlideContent | null>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("AI Presentation");
  const [preview, setPreview] = useState<null | { title: string; text: string; apply: () => void | boolean | Promise<void | boolean> }>(null);
  const [promptSheet, setPromptSheet] = useState<null | { title: string; onSubmit: (v: string) => void }>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    (async () => {
      const m = await getFile(String(id)); const c = await getContent<SlideContent>(String(id));
      setMeta(m); setContent(c);
    })();
  }, [id]);

  const commit = useCallback(async (next: SlideContent): Promise<boolean> => {
    if (!meta) return false;
    try {
      const ok = await saveFile({ ...meta, updatedAt: Date.now() }, next);
      if (!ok) {
        toast.show("Could not apply changes to the presentation", "error");
        return false;
      }
      setContent(next);
      return true;
    } catch (error) {
      console.warn("[slides-tools] apply failed", error);
      toast.show("Could not apply changes to the presentation", "error");
      return false;
    }
  }, [meta, toast]);

  const generateFromTopic = useCallback((topic: string, count = 10) => {
    if (!content) return;
    const outline = ["Introduction", ...AI.outline(topic, count - 2), "Conclusion"].slice(0, count);
    const t = content.theme;
    const slides: Slide[] = [
      { id: genId(), bg: t.bg, layout: "title", elements: [
        { id: genId(), kind: "text", x: 40, y: 140, w: 640, h: 60, text: topic, fontSize: 40, bold: true, color: t.primary },
        { id: genId(), kind: "text", x: 40, y: 210, w: 640, h: 40, text: "AI generated presentation", fontSize: 20, color: t.text },
      ]},
      ...outline.map((h) => ({ id: genId(), bg: t.bg, layout: "content" as const, elements: [
        { id: genId() as string, kind: "text" as const, x: 40, y: 40, w: 640, h: 40, text: h, fontSize: 26, bold: true, color: t.primary },
        { id: genId() as string, kind: "text" as const, x: 40, y: 100, w: 640, h: 240, text: "•  " + AI.summarize(topic + " " + h, 2), fontSize: 16, color: t.text },
      ], notes: `Speaker notes: elaborate on ${h.toLowerCase()} using your own examples.` })),
    ];
    return { ...content, slides };
  }, [content]);

  const tools: Record<string, { id: string; label: string; icon: string; run: () => void }[]> = {
    "AI Presentation": [
      { id: "ai-build", label: "AI Presentation Builder", icon: "auto-fix", run: () => setPromptSheet({ title: "Topic (e.g. Introduction to AI)", onSubmit: (p) => {
        const next = generateFromTopic(p, 10); if (!next) return;
        setPreview({ title: "AI Presentation", text: `Generated ${next.slides.length} slides on: ${p}`, apply: () => commit(next) });
      }})},
      { id: "topic", label: "Topic → Presentation", icon: "lightbulb-outline", run: () => setPromptSheet({ title: "Topic", onSubmit: (p) => {
        const next = generateFromTopic(p, 8); if (!next) return;
        setPreview({ title: "Topic → Slides", text: `${next.slides.length} slides ready`, apply: () => commit(next) });
      }})},
      { id: "story", label: "Storyline Builder", icon: "book-open-variant", run: () => setPromptSheet({ title: "Story arc topic", onSubmit: (p) => {
        const arcs = ["Setup", "Problem", "Insight", "Turning Point", "Resolution"];
        if (!content) return;
        const t = content.theme;
        const next: SlideContent = { ...content, slides: [
          { id: genId(), bg: t.bg, layout: "title", elements: [{ id: genId(), kind: "text", x: 40, y: 160, w: 640, h: 60, text: p, fontSize: 40, bold: true, color: t.primary }] },
          ...arcs.map((a) => ({ id: genId(), bg: t.bg, layout: "content" as const, elements: [
            { id: genId(), kind: "text" as const, x: 40, y: 40, w: 640, h: 40, text: a, fontSize: 26, bold: true, color: t.primary },
            { id: genId(), kind: "text" as const, x: 40, y: 100, w: 640, h: 240, text: "•  " + a + " for " + p, fontSize: 18, color: t.text },
          ] })),
        ]};
        setPreview({ title: "Storyline", text: `${arcs.length + 1} slides`, apply: () => commit(next) });
      }})},
      { id: "struct", label: "Auto Slide Structure", icon: "view-agenda-outline", run: () => {
        if (!content) return;
        const titles = content.slides.slice(1).map((s, i) => {
          const first = s.elements.find((e) => e.kind === "text");
          return `${i + 1}. ${first && first.kind === "text" ? first.text : "Slide"}`;
        }).join("\n");
        setPreview({ title: "Structure", text: titles || "Only title slide", apply: () => {} });
      }},
      { id: "layout", label: "AI Layout Designer", icon: "view-grid-outline", run: () => {
        if (!content) return;
        // Simple redistribute: even spacing for text elements
        const next: SlideContent = { ...content, slides: content.slides.map((s) => {
          const texts = s.elements.filter((e) => e.kind === "text");
          const others = s.elements.filter((e) => e.kind !== "text");
          const totalH = 300;
          const step = totalH / Math.max(1, texts.length);
          return { ...s, elements: [...others, ...texts.map((t, i) => ({ ...t, y: 60 + i * step, x: 40, w: 640 }))] };
        })};
        setPreview({ title: "Layout applied", text: "Redistributed spacing on every slide.", apply: () => commit(next) });
      }},
      { id: "theme", label: "Smart Theme Generator", icon: "palette-outline", run: () => setPromptSheet({ title: "Theme (modernOrange, darkPro, academic, corporate, startup, finance, marketing, tech, minimal, research, creative, portfolio, healthcare, travel, bold)", onSubmit: (p) => {
        const key = p.trim() as keyof typeof SLIDE_THEMES;
        const t = SLIDE_THEMES[key] || SLIDE_THEMES.modernOrange;
        if (!content) return;
        const next: SlideContent = { ...content, theme: t, slides: content.slides.map((s) => ({ ...s, bg: s.layout === "section" || s.layout === "conclusion" ? t.primary : t.bg })) };
        setPreview({ title: `Theme: ${t.name}`, text: "Colors and backgrounds updated.", apply: () => commit(next) });
      }})},
      { id: "editor", label: "Slide-by-Slide AI Editor", icon: "pencil-outline", run: () => setPromptSheet({ title: "Command (e.g. simplify, expand)", onSubmit: (p) => {
        if (!content) return;
        const mode = /simplif/.test(p) ? "shorten" : /expand/.test(p) ? "expand" : "improve";
        const next: SlideContent = { ...content, slides: content.slides.map((s) => ({
          ...s,
          elements: s.elements.map((e) => e.kind === "text" ? { ...e, text: AI.rewrite(e.text, mode as any) } : e),
        })) };
        setPreview({ title: `Editor (${mode})`, text: "Applied to every slide.", apply: () => commit(next) });
      }})},
      { id: "agent", label: "Presentation Agent", icon: "robot-outline", run: () => setPromptSheet({ title: "Ask (e.g. create a 10 slide about climate change)", onSubmit: (p) => {
        const m = /(\d+)\s*slide/i.exec(p);
        const n = m ? parseInt(m[1]) : 10;
        const topic = p.replace(/.*(about|on)\s+/i, "").trim() || p;
        const next = generateFromTopic(topic, n);
        if (!next) return;
        setPreview({ title: `Agent plan`, text: `Generate ${next.slides.length} slides about "${topic}".`, apply: () => commit(next) });
      }})},
    ],
    "Content & Visuals": [
      { id: "doc", label: "Document → Slides", icon: "file-document-outline", run: () => setPromptSheet({ title: "Paste document text", onSubmit: (p) => {
        const heads = AI.outline(p, 8);
        if (!content) return;
        const t = content.theme;
        const slides: Slide[] = heads.map((h) => ({ id: genId(), bg: t.bg, layout: "content", elements: [
          { id: genId(), kind: "text", x: 40, y: 40, w: 640, h: 40, text: h.slice(0, 60), fontSize: 26, bold: true, color: t.primary },
          { id: genId(), kind: "text", x: 40, y: 100, w: 640, h: 240, text: "•  " + AI.summarize(h, 1), fontSize: 16, color: t.text },
        ]}));
        setPreview({ title: "From Document", text: `${slides.length} slides`, apply: () => commit({ ...content, slides }) });
      }})},
      { id: "sheet", label: "Sheet → Slides", icon: "table", run: () => toast.show("Open the sheet and use Sheet → Slides tool", "info") },
      { id: "pdf", label: "PDF → Slides (paste text)", icon: "file-pdf-box", run: () => setPromptSheet({ title: "Paste PDF text", onSubmit: (p) => {
        const heads = AI.outline(p, 8);
        if (!content) return;
        const t = content.theme;
        const slides = heads.map((h) => ({ id: genId(), bg: t.bg, layout: "content" as const, elements: [
          { id: genId(), kind: "text" as const, x: 40, y: 40, w: 640, h: 40, text: h.slice(0, 60), fontSize: 26, bold: true, color: t.primary },
          { id: genId(), kind: "text" as const, x: 40, y: 100, w: 640, h: 240, text: AI.summarize(h, 1), fontSize: 16, color: t.text },
        ]}));
        setPreview({ title: "From PDF", text: `${slides.length} slides`, apply: () => commit({ ...content, slides }) });
      }})},
      { id: "visual", label: "Smart Visual Selection", icon: "palette-swatch", run: () => setPreview({ title: "Visual suggestions", text: "Use shapes: rectangles for stats, circles for milestones, triangles for direction. Insert via toolbar.", apply: () => {} })},
      { id: "img-place", label: "AI Image Placement", icon: "image-outline", run: () => setPreview({ title: "Image guide", text: "Place hero images on the right (2/3 width), captions below at 14pt.", apply: () => {} })},
      { id: "auto-chart", label: "Automatic Charts", icon: "chart-bar", run: () => toast.show("Insert charts via Sheets, then use Sheet → Slides", "info") },
      { id: "chart-explain", label: "Chart Explanation", icon: "help-circle-outline", run: () => setPreview({ title: "Chart guide", text: "For each chart include: 1) title, 2) data source, 3) key takeaway.", apply: () => {} })},
      { id: "simplify", label: "Slide Simplifier", icon: "text-short", run: () => {
        if (!content) return;
        const next: SlideContent = { ...content, slides: content.slides.map((s) => ({ ...s, elements: s.elements.map((e) => e.kind === "text" ? { ...e, text: AI.rewrite(e.text, "shorten") } : e) })) };
        setPreview({ title: "Simplified", text: "Shortened all text.", apply: () => commit(next) });
      }},
    ],
    "Coaching": [
      { id: "notes", label: "Speaker Notes Generator", icon: "note-text-outline", run: () => {
        if (!content) return;
        const next: SlideContent = { ...content, slides: content.slides.map((s) => {
          const t = s.elements.find((e) => e.kind === "text");
          const text = t && t.kind === "text" ? t.text : "";
          return { ...s, notes: `Talking point: ${text.slice(0, 100)}. Add a story or example here.` };
        })};
        setPreview({ title: "Speaker Notes", text: "Notes added to every slide.", apply: () => commit(next) });
      }},
      { id: "script", label: "Presentation Script", icon: "script-text-outline", run: () => {
        if (!content) return;
        const script = content.slides.map((s, i) => {
          const t = s.elements.find((e) => e.kind === "text");
          return `Slide ${i + 1}: ${t && t.kind === "text" ? t.text : ""}\n${s.notes || "…"}`;
        }).join("\n\n");
        setPreview({ title: "Script", text: script, apply: () => {} });
      }},
      { id: "audience", label: "Audience Adaptation", icon: "account-group-outline", run: () => setPromptSheet({ title: "Audience (students / execs / general)", onSubmit: (p) => {
        toast.show(`Presentation tone adjusted for: ${p}. Use Slide Simplifier for concise mode.`, "info");
      }})},
      { id: "tone-adapt", label: "Tone Adaptation", icon: "human-greeting-variant", run: () => setPromptSheet({ title: "Tone", onSubmit: (p) => {
        if (!content) return;
        const next: SlideContent = { ...content, slides: content.slides.map((s) => ({ ...s, elements: s.elements.map((e) => e.kind === "text" ? { ...e, text: AI.changeTone(e.text, (p.toLowerCase() as any) || "professional") } : e) })) };
        setPreview({ title: "Tone adjusted", text: "Applied to all text.", apply: () => commit(next) });
      }})},
      { id: "summarize", label: "Presentation Summarizer", icon: "text-short", run: () => {
        if (!content) return;
        const all = content.slides.flatMap((s) => s.elements.filter((e) => e.kind === "text").map((e: any) => e.text)).join(" ");
        setPreview({ title: "Summary", text: AI.summarize(all, 5), apply: () => {} });
      }},
      { id: "practice", label: "Practice Coach", icon: "timer-outline", run: () => {
        if (!content) return;
        const words = content.slides.flatMap((s) => s.elements.filter((e) => e.kind === "text").map((e: any) => e.text.split(/\s+/).length)).reduce((a, b) => a + b, 0);
        setPreview({ title: "Practice Coach", text: `Estimated words: ${words}. At 130 words/minute this presentation will run about ${Math.max(1, Math.round(words / 130))} minute(s). Aim for 30-45 seconds per slide.`, apply: () => {} });
      }},
    ],
    "Design & Themes": [
      { id: "autofmt", label: "Automatic Formatting", icon: "auto-fix", run: () => {
        if (!content) return;
        const t = content.theme;
        const next: SlideContent = { ...content, slides: content.slides.map((s) => ({
          ...s,
          elements: s.elements.map((e) => e.kind === "text" ? {
            ...e,
            color: e.fontSize && e.fontSize > 24 ? t.primary : t.text,
          } : e),
        })) };
        setPreview({ title: "Formatting", text: "Applied consistent colors.", apply: () => commit(next) });
      }},
      { id: "check", label: "Consistency Checker", icon: "check-decagram-outline", run: () => {
        if (!content) return;
        const fonts = new Set<number>();
        content.slides.forEach((s) => s.elements.forEach((e) => e.kind === "text" && fonts.add(e.fontSize)));
        setPreview({ title: "Consistency", text: `Unique font sizes: ${[...fonts].sort().join(", ")}. Ideal: 3-4 sizes.`, apply: () => {} });
      }},
      { id: "align", label: "Alignment & Spacing", icon: "align-horizontal-left", run: () => {
        if (!content) return;
        const next: SlideContent = { ...content, slides: content.slides.map((s) => ({
          ...s,
          elements: s.elements.map((e) => e.kind === "text" ? { ...e, x: 40, w: 640 } : e),
        })) };
        setPreview({ title: "Aligned", text: "Text aligned to a 40px left margin.", apply: () => commit(next) });
      }},
      { id: "brand", label: "Brand Manager", icon: "briefcase-outline", run: () => setPromptSheet({ title: "Primary hex (e.g. #FF5E00)", onSubmit: (p) => {
        if (!content) return;
        const t = { ...content.theme, primary: p, accent: p };
        setPreview({ title: "Brand", text: `Primary color set to ${p}`, apply: () => commit({ ...content, theme: t }) });
      }})},
      { id: "tpl-gen", label: "Template Generator", icon: "file-multiple-outline", run: () => router.push("/templates" as any) },
      { id: "live-chart", label: "Live Sheet → Chart", icon: "chart-line", run: () => toast.show("Insert charts in Sheets, then Sheet → Slides", "info") },
    ],
    "Conversion": [
      { id: "to-doc", label: "Presentation → Document", icon: "file-document-outline", run: async () => {
        if (!content || !meta) return;
        const { meta: dm, content: dc } = newDoc(`${meta.title} — Notes`, meta.workspaceId);
        dc.blocks = content.slides.flatMap((s, i) => {
          const title = s.elements.find((e) => e.kind === "text");
          const body = s.elements.filter((e) => e.kind === "text").slice(1);
          return [
            { id: genId(), kind: "h2" as const, text: title && title.kind === "text" ? title.text : `Slide ${i + 1}` },
            ...body.map((b: any) => ({ id: genId(), kind: "p" as const, text: b.text })),
            ...(s.notes ? [{ id: genId(), kind: "p" as const, text: `Notes: ${s.notes}` }] : []),
          ];
        });
        await saveFile(dm, dc); toast.show("Document created", "success"); router.push(`/docs/${dm.id}` as any);
      }},
      { id: "to-pdf", label: "Export → PDF (info)", icon: "file-pdf-box", run: () => setPreview({ title: "PDF Export", text: "PDF export from React Native needs a native module. In this offline build, use device Print → Save as PDF from the Present view.", apply: () => {} }) },
    ],
  };

  const applyPreview = useCallback(async () => {
    if (!preview) return;
    try {
      const result = await preview.apply();
      if (result === false) return;
      setPreview(null);
    } catch (error) {
      console.warn("[slides-tools] preview apply failed", error);
      toast.show("Could not apply changes", "error");
    }
  }, [preview, toast]);

  const active = tools[category] || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="tools-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Slides Tools</AppText>
        <TouchableOpacity onPress={() => setPromptSheet({ title: "AI Command (e.g. 10 slides about AI)", onSubmit: (p) => {
          const c = p.toLowerCase();
          if (c.includes("slide") && /(\d+)/.test(c)) tools["AI Presentation"][7].run();
          else if (c.includes("simpl")) tools["Content & Visuals"][7].run();
          else if (c.includes("summar")) tools.Coaching[4].run();
          else if (c.includes("theme")) tools["AI Presentation"][5].run();
          else toast.show("Try: 10 slides about, simplify, summarize, theme", "info");
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
        <ScrollView style={{ maxHeight: 320 }}><AppText>{preview?.text}</AppText></ScrollView>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button title="Close" kind="secondary" onPress={() => setPreview(null)} style={{ flex: 1 }} testID="preview-cancel" />
          <Button title="Apply" onPress={applyPreview} style={{ flex: 1 }} testID="preview-apply" />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!promptSheet} onClose={() => { setPromptSheet(null); setPrompt(""); }} title={promptSheet?.title}>
        <TextInput testID="ai-prompt-input" value={prompt} onChangeText={setPrompt} multiline placeholder="Type here" placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 80, color: colors.onSurface, textAlignVertical: "top" }} />
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
