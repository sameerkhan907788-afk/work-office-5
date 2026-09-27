import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { Card } from "@/src/components/card";
import { KeyboardAvoid, SCROLL_KEYBOARD_PROPS, dismissKeyboard, useDismissKeyboardOnUnmount } from "@/src/components/keyboard";
import { useTheme, radius } from "@/src/theme";
import { FileMeta, getContent, listFiles } from "@/src/storage/db";

type Hit = { file: FileMeta; snippet: string };

export default function Search() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<{ file: FileMeta; text: string }[]>([]);
  const [ready, setReady] = useState(false);

  // The search field auto-focuses; never let the keyboard linger after leaving.
  useDismissKeyboardOnUnmount();

  useEffect(() => {
    (async () => {
      const files = await listFiles();
      const idx: { file: FileMeta; text: string }[] = [];
      for (const f of files) {
        if (f.trashed) continue;
        const c = await getContent<any>(f.id);
        let text = "";
        if (f.type === "doc" && c?.blocks) text = c.blocks.map((b: any) => b.text).join(" ");
        else if (f.type === "sheet" && c?.sheets) text = c.sheets.flatMap((s: any) => Object.values(s.cells).map((cc: any) => cc.v ?? "")).join(" ");
        else if (f.type === "slide" && c?.slides) text = c.slides.flatMap((s: any) => s.elements.filter((e: any) => e.kind === "text").map((e: any) => e.text)).join(" ");
        idx.push({ file: f, text });
      }
      setIndex(idx); setReady(true);
    })();
  }, []);

  const hits: Hit[] = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return index
      .map(({ file, text }) => {
        const t = text.toLowerCase();
        const i = t.indexOf(s);
        if (i < 0 && !file.title.toLowerCase().includes(s)) return null;
        const start = Math.max(0, i - 30);
        const snippet = i >= 0 ? "…" + text.slice(start, start + 120) + "…" : file.title;
        return { file, snippet } as Hit;
      })
      .filter((x): x is Hit => !!x);
  }, [q, index]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { dismissKeyboard(); router.back(); }} testID="search-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Global search</AppText>
      </View>
      <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Icon name="magnify" size={18} color={colors.muted} />
        <TextInput testID="global-search" autoFocus value={q} onChangeText={setQ} placeholder="Search all files" placeholderTextColor={colors.muted} returnKeyType="search" style={{ flex: 1, color: colors.onSurface, fontSize: 15 }} />
      </View>
      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}>
        {!ready ? <AppText variant="muted">Indexing…</AppText> : q.trim() === "" ? <AppText variant="muted">Type to search across documents, sheets and slides.</AppText> : hits.length === 0 ? <Card><AppText style={{ textAlign: "center" }}>No matches</AppText></Card> : hits.map((h) => {
          const iconName = h.file.type === "doc" ? "file-document-outline" : h.file.type === "sheet" ? "table" : "presentation";
          const iconColor = h.file.type === "doc" ? "#FF5E00" : h.file.type === "sheet" ? "#22C55E" : "#7C3AED";
          return (
            <TouchableOpacity key={h.file.id} testID={`hit-${h.file.id}`} onPress={() => { dismissKeyboard(); router.push(`/${h.file.type === "doc" ? "docs" : h.file.type === "sheet" ? "sheets" : "slides"}/${h.file.id}` as any); }}>
              <Card style={{ padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: iconColor + "22", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={iconName as any} size={18} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="title" numberOfLines={1}>{h.file.title}</AppText>
                    <AppText variant="caption" numberOfLines={2}>{h.snippet}</AppText>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      </KeyboardAvoid>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
});
