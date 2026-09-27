import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView, FlatList, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { KeyboardAvoid, SCROLL_KEYBOARD_PROPS, dismissKeyboard } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme, spacing, radius } from "@/src/theme";
import { DocBlock, DocContent, FileMeta, getContent, getFile, genId, saveFile } from "@/src/storage/db";

type Selection = { blockId: string; range?: "all" };

export default function DocEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [content, setContent] = useState<DocContent | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(0);
  const [findVisible, setFindVisible] = useState(false);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const historyRef = useRef<DocContent[]>([]);
  const futureRef = useRef<DocContent[]>([]);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const m = await getFile(String(id));
      const c = await getContent<DocContent>(String(id));
      setMeta(m); setContent(c || { blocks: [{ id: genId(), kind: "p", text: "" }] });
    })();
  }, [id]);

  const scheduleSave = useCallback((nextContent: DocContent, nextMeta?: FileMeta) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDirty(true);
    saveTimer.current = setTimeout(async () => {
      const m = nextMeta || meta;
      if (!m) return;
      await saveFile({ ...m, updatedAt: Date.now() }, nextContent);
      setDirty(false); setSavedAt(Date.now());
    }, 500);
  }, [meta]);

  const commit = useCallback((updater: (c: DocContent) => DocContent) => {
    setContent((prev) => {
      if (!prev) return prev;
      historyRef.current.push(prev);
      if (historyRef.current.length > 50) historyRef.current.shift();
      futureRef.current = [];
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const undo = useCallback(() => {
    setContent((prev) => {
      if (!prev) return prev;
      const prevState = historyRef.current.pop();
      if (!prevState) return prev;
      futureRef.current.push(prev);
      scheduleSave(prevState);
      return prevState;
    });
  }, [scheduleSave]);

  const redo = useCallback(() => {
    setContent((prev) => {
      if (!prev) return prev;
      const next = futureRef.current.pop();
      if (!next) return prev;
      historyRef.current.push(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const setTitle = useCallback((title: string) => {
    if (!meta) return;
    const next = { ...meta, title };
    setMeta(next);
    if (content) scheduleSave(content, next);
  }, [meta, content, scheduleSave]);

  const updateBlock = useCallback((bid: string, patch: Partial<DocBlock>) => {
    commit((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === bid ? { ...b, ...patch, style: { ...b.style, ...patch.style } } : b)) }));
  }, [commit]);

  const insertBlock = useCallback((afterId: string | null, kind: DocBlock["kind"] = "p") => {
    commit((c) => {
      const idx = afterId ? c.blocks.findIndex((b) => b.id === afterId) : c.blocks.length - 1;
      const nb: DocBlock = { id: genId(), kind, text: "" };
      const next = [...c.blocks]; next.splice(idx + 1, 0, nb);
      return { ...c, blocks: next };
    });
  }, [commit]);

  const removeBlock = useCallback((bid: string) => {
    commit((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== bid).length ? c.blocks.filter((b) => b.id !== bid) : [{ id: genId(), kind: "p", text: "" }] }));
  }, [commit]);

  const applyStyleToSelected = useCallback((patch: Partial<NonNullable<DocBlock["style"]>>) => {
    if (!selection) return;
    updateBlock(selection.blockId, { style: patch as any });
  }, [selection, updateBlock]);

  const setKindOnSelected = useCallback((kind: DocBlock["kind"]) => {
    if (!selection) return;
    updateBlock(selection.blockId, { kind });
  }, [selection, updateBlock]);

  const runFindReplace = useCallback(() => {
    if (!find) return;
    commit((c) => ({
      ...c,
      blocks: c.blocks.map((b) => ({ ...b, text: b.text.split(find).join(replace) })),
    }));
    toast.show("Replaced", "success");
  }, [find, replace, commit, toast]);

  if (!meta || !content) {
    return <View style={[styles.center, { backgroundColor: colors.surface }]}><AppText>Loading…</AppText></View>;
  }

  const status = dirty ? "Saving…" : savedAt ? "Saved" : "Ready";

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="back-button">
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <TextInput
          testID="doc-title"
          value={meta.title}
          onChangeText={setTitle}
          placeholder="Untitled"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[styles.titleInput, { color: colors.onSurface }]}
        />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity onPress={undo} testID="doc-undo"><Icon name="undo" size={22} color={colors.onSurface} /></TouchableOpacity>
          <TouchableOpacity onPress={redo} testID="doc-redo"><Icon name="redo" size={22} color={colors.onSurface} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setFindVisible(true)} testID="doc-find"><Icon name="magnify" size={22} color={colors.onSurface} /></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/docs/tools/${id}` as any)} testID="doc-tools">
            <Icon name="tune-variant" size={22} color={colors.brandPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.statusRow, { borderBottomColor: colors.border }]}>
        <AppText variant="caption">{status} · {content.blocks.reduce((s, b) => s + b.text.trim().split(/\s+/).filter(Boolean).length, 0)} words</AppText>
      </View>

      <KeyboardAvoid style={{ flex: 1 }}>
        <ScrollView {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {content.blocks.map((b) => (
            <BlockEditor
              key={b.id} block={b}
              onFocus={() => setSelection({ blockId: b.id })}
              onChange={(text) => updateBlock(b.id, { text })}
              onEnter={() => insertBlock(b.id, b.kind === "ul" || b.kind === "ol" ? b.kind : "p")}
              onBackspaceEmpty={() => removeBlock(b.id)}
            />
          ))}
          <TouchableOpacity onPress={() => insertBlock(null, "p")} style={{ padding: 10, alignItems: "center" }} testID="doc-add-block">
            <Icon name="plus" size={22} color={colors.muted} />
          </TouchableOpacity>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary }]} contentContainerStyle={{ paddingHorizontal: 12, alignItems: "center", gap: 6 }}>
          <TB icon="format-header-1" onPress={() => setKindOnSelected("h1")} />
          <TB icon="format-header-2" onPress={() => setKindOnSelected("h2")} />
          <TB icon="format-header-3" onPress={() => setKindOnSelected("h3")} />
          <TB icon="format-paragraph" onPress={() => setKindOnSelected("p")} />
          <TB icon="format-list-bulleted" onPress={() => setKindOnSelected("ul")} />
          <TB icon="format-list-numbered" onPress={() => setKindOnSelected("ol")} />
          <TB icon="format-quote-close" onPress={() => setKindOnSelected("quote")} />
          <TB icon="code-tags" onPress={() => setKindOnSelected("code")} />
          <View style={styles.divider} />
          <TB icon="format-bold" onPress={() => applyStyleToSelected({ bold: !(selection && content.blocks.find((b) => b.id === selection.blockId)?.style?.bold) })} />
          <TB icon="format-italic" onPress={() => applyStyleToSelected({ italic: !(selection && content.blocks.find((b) => b.id === selection.blockId)?.style?.italic) })} />
          <TB icon="format-underline" onPress={() => applyStyleToSelected({ underline: !(selection && content.blocks.find((b) => b.id === selection.blockId)?.style?.underline) })} />
          <TB icon="format-strikethrough" onPress={() => applyStyleToSelected({ strike: !(selection && content.blocks.find((b) => b.id === selection.blockId)?.style?.strike) })} />
          <View style={styles.divider} />
          <TB icon="format-align-left" onPress={() => applyStyleToSelected({ align: "left" })} />
          <TB icon="format-align-center" onPress={() => applyStyleToSelected({ align: "center" })} />
          <TB icon="format-align-right" onPress={() => applyStyleToSelected({ align: "right" })} />
          <View style={styles.divider} />
          <TB icon="minus" onPress={() => insertBlock(selection?.blockId ?? null, "divider")} />
        </ScrollView>
      </KeyboardAvoid>

      <BottomSheet visible={findVisible} onClose={() => setFindVisible(false)} title="Find & Replace">
        <TextInput testID="find-input" value={find} onChangeText={setFind} placeholder="Find" placeholderTextColor={colors.muted} returnKeyType="next" style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]} />
        <TextInput testID="replace-input" value={replace} onChangeText={setReplace} placeholder="Replace with" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={() => { dismissKeyboard(); runFindReplace(); setFindVisible(false); }} style={[styles.input, { color: colors.onSurface, borderColor: colors.border, marginTop: 8 }]} />
        <Button testID="replace-run" title="Replace all" icon="find-replace" onPress={() => { dismissKeyboard(); runFindReplace(); setFindVisible(false); }} style={{ marginTop: 12 }} />
      </BottomSheet>
    </View>
  );
}

function TB({ icon, onPress }: { icon: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 10, borderRadius: 10 }} testID={`tb-${icon}`}>
      <Icon name={icon as any} size={20} color={colors.onSurface} />
    </TouchableOpacity>
  );
}

function BlockEditor({ block, onChange, onFocus, onEnter, onBackspaceEmpty }: {
  block: DocBlock; onChange: (t: string) => void; onFocus: () => void; onEnter: () => void; onBackspaceEmpty: () => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(block.text);
  useEffect(() => { setText(block.text); }, [block.text]);

  if (block.kind === "divider") {
    return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />;
  }

  const s = block.style || {};
  const fontSize = block.kind === "h1" ? 28 : block.kind === "h2" ? 22 : block.kind === "h3" ? 18 : block.kind === "code" ? 14 : 16;
  const fontWeight: any = block.kind === "h1" || block.kind === "h2" || block.kind === "h3" ? "700" : s.bold ? "700" : "400";
  const fontStyle: any = s.italic ? "italic" : "normal";
  const textDecorationLine: any = s.underline && s.strike ? "underline line-through" : s.underline ? "underline" : s.strike ? "line-through" : "none";
  const textAlign: any = s.align || "left";
  const bg = block.kind === "code" ? colors.surfaceTertiary : block.kind === "quote" ? colors.brandTertiary : "transparent";
  const prefix = block.kind === "ul" ? "•  " : block.kind === "ol" ? "1.  " : "";

  return (
    <View style={{ marginVertical: 4, backgroundColor: bg, borderRadius: block.kind === "code" || block.kind === "quote" ? 10 : 0, paddingHorizontal: block.kind === "code" || block.kind === "quote" ? 12 : 0, paddingVertical: block.kind === "code" || block.kind === "quote" ? 8 : 0, borderLeftWidth: block.kind === "quote" ? 4 : 0, borderLeftColor: colors.brandPrimary }}>
      <TextInput
        testID={`block-${block.id}`}
        multiline
        onFocus={onFocus}
        value={text}
        onChangeText={(t) => { setText(t); onChange(t); }}
        placeholder={block.kind === "h1" ? "Heading 1" : block.kind === "h2" ? "Heading 2" : block.kind === "h3" ? "Heading 3" : "Type here"}
        placeholderTextColor={colors.muted}
        style={{
          fontSize, fontWeight, fontStyle, textDecorationLine, textAlign,
          color: s.color || colors.onSurface,
          backgroundColor: s.highlight || "transparent",
          fontFamily: block.kind === "code" ? Platform.select({ ios: "Menlo", android: "monospace" }) : undefined,
        }}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Enter") {
            // We don't intercept newline (multiline), but insert a new block if bullet/numbered and text non-empty at end
          }
          if (nativeEvent.key === "Backspace" && text === "") {
            onBackspaceEmpty();
          }
        }}
        blurOnSubmit={false}
      />
      {prefix ? <View pointerEvents="none" style={{ position: "absolute", left: -18, top: 4 }}><AppText style={{ color: colors.muted }}>{prefix}</AppText></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  titleInput: { flex: 1, fontSize: 17, fontWeight: "600" },
  statusRow: { paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1 },
  toolbar: { height: 52, borderTopWidth: 1 },
  divider: { width: 1, height: 24, backgroundColor: "#D1D1D6", marginHorizontal: 4 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
