import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { KeyboardAvoid, SCROLL_KEYBOARD_PROPS } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme } from "@/src/theme";
import { FileMeta, SlideContent, Slide, SlideElement, getContent, getFile, genId, saveFile } from "@/src/storage/db";
import { SlideView } from "@/src/components/slide-view";

const CANVAS_W = 720;
const CANVAS_H = 405;

export default function SlideEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<SlideContent | null>(null);
  const [current, setCurrent] = useState(0);
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [textEdit, setTextEdit] = useState(false);
  const [present, setPresent] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<any>(null);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    const load = async () => {
      try {
        const m = await getFile(String(id));
        const c = await getContent<SlideContent>(String(id));
        if (mounted) {
          setMeta(m);
          setContent(c);
        }
      } catch (error) {
        console.warn("[slides] load failed", error);
        if (mounted) toast.show("Could not open this presentation", "error");
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id, toast]));

  const scheduleSave = useCallback((next: SlideContent, nextMeta?: FileMeta) => {
    const m = nextMeta || meta;
    if (!m) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDirty(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const ok = await saveFile({ ...m, updatedAt: Date.now() }, next);
        if (!ok) {
          toast.show("Could not save presentation", "error");
          return;
        }
        setDirty(false); setSavedAt(Date.now());
      } catch (error) {
        console.warn("[slides] save failed", error);
        toast.show("Could not save presentation", "error");
      }
    }, 500);
  }, [meta, toast]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  const updateContent = useCallback((updater: (c: SlideContent) => SlideContent) => {
    setContent((prev) => { if (!prev) return prev; const n = updater(prev); scheduleSave(n); return n; });
  }, [scheduleSave]);

  const updateSlide = useCallback((sid: string, updater: (s: Slide) => Slide) => {
    updateContent((c) => ({ ...c, slides: c.slides.map((s) => (s.id === sid ? updater(s) : s)) }));
  }, [updateContent]);

  const addSlide = useCallback((layout = "content") => {
    updateContent((c) => {
      const t = c.theme;
      const ns: Slide = { id: genId(), bg: t.bg, layout, elements: [
        { id: genId(), kind: "text", x: 40, y: 40, w: CANVAS_W - 80, h: 40, text: "New slide", fontSize: 26, bold: true, color: t.primary },
        { id: genId(), kind: "text", x: 40, y: 110, w: CANVAS_W - 80, h: 240, text: "Click to add content", fontSize: 18, color: t.text },
      ]};
      const next = { ...c, slides: [...c.slides.slice(0, current + 1), ns, ...c.slides.slice(current + 1)] };
      setCurrent(current + 1);
      return next;
    });
  }, [current, updateContent]);

  const deleteSlide = useCallback(() => {
    if (!content || content.slides.length <= 1) { toast.show("Keep at least one slide", "info"); return; }
    updateContent((c) => ({ ...c, slides: c.slides.filter((_, i) => i !== current) }));
    setCurrent((i) => Math.max(0, i - 1));
  }, [content, current, updateContent, toast]);

  const duplicateSlide = useCallback(() => {
    updateContent((c) => {
      const s = c.slides[current];
      const copy: Slide = { ...s, id: genId(), elements: s.elements.map((e) => ({ ...e, id: genId() })) };
      const next = { ...c, slides: [...c.slides.slice(0, current + 1), copy, ...c.slides.slice(current + 1)] };
      setCurrent(current + 1);
      return next;
    });
  }, [current, updateContent]);

  const updateEl = useCallback((slideId: string, elId: string, patch: Partial<SlideElement>) => {
    updateSlide(slideId, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === elId ? ({ ...e, ...patch } as SlideElement) : e)) }));
  }, [updateSlide]);

  const deleteEl = useCallback((slideId: string, elId: string) => {
    updateSlide(slideId, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== elId) }));
    setSelectedEl(null);
  }, [updateSlide]);

  const addElement = useCallback((slideId: string, kind: "text" | "shape") => {
    updateSlide(slideId, (s) => {
      const el: SlideElement = kind === "text"
        ? { id: genId(), kind: "text", x: 60, y: 60, w: 400, h: 50, text: "Text", fontSize: 18, color: content?.theme.text || "#000" }
        : { id: genId(), kind: "shape", x: 60, y: 60, w: 120, h: 80, shape: "rect", fill: content?.theme.primary || "#FF5E00" };
      return { ...s, elements: [...s.elements, el] };
    });
  }, [updateSlide, content]);

  if (!meta || !content) {
    return <View style={[styles.center, { backgroundColor: colors.surface }]}><AppText>Presentation unavailable</AppText></View>;
  }

  const slide = content.slides[current];
  const el = slide?.elements.find((e) => e.id === selectedEl);

  if (present) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <SlideView slide={slide} theme={content.theme} width={Dimensions.get("window").width} height={Dimensions.get("window").width * (CANVAS_H / CANVAS_W)} />
        <View style={{ position: "absolute", bottom: 40, flexDirection: "row", gap: 24 }}>
          <TouchableOpacity onPress={() => setCurrent(Math.max(0, current - 1))} testID="present-prev"><Icon name="chevron-left" size={40} color="#FFF" /></TouchableOpacity>
          <TouchableOpacity onPress={() => setPresent(false)} testID="present-close"><Icon name="close" size={40} color="#FFF" /></TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrent(Math.min(content.slides.length - 1, current + 1))} testID="present-next"><Icon name="chevron-right" size={40} color="#FFF" /></TouchableOpacity>
        </View>
        <View style={{ position: "absolute", top: 40, right: 20 }}><AppText color="#FFF">{current + 1} / {content.slides.length}</AppText></View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="back-button"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <TextInput
          testID="slide-title"
          value={meta.title}
          onChangeText={(t) => { const m = { ...meta, title: t }; setMeta(m); if (content) scheduleSave(content, m); }}
          returnKeyType="done"
          style={[styles.titleInput, { color: colors.onSurface }]}
        />
        <TouchableOpacity onPress={() => setPresent(true)} testID="slide-present"><Icon name="play-circle-outline" size={24} color={colors.brandPrimary} /></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/slides/tools/${id}` as any)} testID="slide-tools"><Icon name="tune-variant" size={22} color={colors.brandPrimary} /></TouchableOpacity>
      </View>

      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, alignItems: "center" }}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSelectedEl(null)}>
          <SlideView slide={slide} theme={content.theme} width={Math.min(Dimensions.get("window").width - 32, 640)} height={Math.min(Dimensions.get("window").width - 32, 640) * (CANVAS_H / CANVAS_W)} selectedId={selectedEl} onSelectEl={setSelectedEl} onEditText={(id, text) => updateEl(slide.id, id, { text } as any)} />
        </TouchableOpacity>

        {el ? (
          <View style={{ width: "100%", marginTop: 16, gap: 8 }}>
            <AppText variant="label">Selected: {el.kind}</AppText>
            {el.kind === "text" ? (
              <>
                <TextInput
                  testID="edit-text"
                  value={el.text}
                  onChangeText={(t) => updateEl(slide.id, el.id, { text: t } as any)}
                  multiline
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.onSurface }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title="Bigger" kind="secondary" size="sm" onPress={() => updateEl(slide.id, el.id, { fontSize: el.fontSize + 2 } as any)} testID="text-bigger" />
                  <Button title="Smaller" kind="secondary" size="sm" onPress={() => updateEl(slide.id, el.id, { fontSize: Math.max(8, el.fontSize - 2) } as any)} testID="text-smaller" />
                  <Button title={el.bold ? "Unbold" : "Bold"} kind="secondary" size="sm" onPress={() => updateEl(slide.id, el.id, { bold: !el.bold } as any)} testID="text-bold" />
                </View>
              </>
            ) : null}
            <Button title="Delete element" kind="danger" size="sm" onPress={() => deleteEl(slide.id, el.id)} testID="delete-el" />
          </View>
        ) : null}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary }]} contentContainerStyle={{ paddingHorizontal: 12, alignItems: "center", gap: 6 }}>
        <TB icon="plus" onPress={() => addSlide()} label="Add" />
        <TB icon="content-duplicate" onPress={duplicateSlide} label="Duplicate" />
        <TB icon="trash-can-outline" onPress={deleteSlide} label="Delete" />
        <View style={styles.divider} />
        <TB icon="format-text" onPress={() => addElement(slide.id, "text")} label="Text" />
        <TB icon="rectangle-outline" onPress={() => addElement(slide.id, "shape")} label="Shape" />
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.thumbs, { borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary }]} contentContainerStyle={{ padding: 8, gap: 8, alignItems: "center" }}>
        {content.slides.map((s, i) => (
          <TouchableOpacity key={s.id} onPress={() => { setCurrent(i); setSelectedEl(null); }} testID={`thumb-${i}`} style={[styles.thumb, { borderColor: i === current ? colors.brandPrimary : colors.border, backgroundColor: s.bg }]}>
            <AppText style={{ fontSize: 10, color: colors.muted, position: "absolute", top: -14, left: 0 }}>{i + 1}</AppText>
            <SlideView slide={s} theme={content.theme} width={80} height={45} interactive={false} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ padding: 8, alignItems: "center" }}>
        <AppText variant="caption">{dirty ? "Unsaved changes" : "Saved"} · Slide {current + 1} of {content.slides.length}</AppText>
      </View>
      </KeyboardAvoid>
    </View>
  );
}

function TB({ icon, onPress, label }: { icon: string; onPress: () => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 8, alignItems: "center" }} testID={`slide-tb-${icon}`}>
      <Icon name={icon as any} size={20} color={colors.onSurface} />
      {label ? <AppText style={{ fontSize: 10, color: colors.muted }}>{label}</AppText> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  titleInput: { flex: 1, fontSize: 17, fontWeight: "600" },
  toolbar: { height: 56, borderTopWidth: 1 },
  divider: { width: 1, height: 20, backgroundColor: "#D1D1D6", marginHorizontal: 4 },
  thumbs: { height: 80, borderTopWidth: 1 },
  thumb: { width: 84, height: 49, borderRadius: 6, borderWidth: 2, overflow: "hidden", justifyContent: "center", alignItems: "center", marginTop: 14 },
});
