import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { Card } from "@/src/components/card";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { KeyboardAvoid, SCROLL_KEYBOARD_PROPS } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme, radius } from "@/src/theme";
import { buildFromTemplate, TEMPLATES, TemplateCategory } from "@/src/slides/templates";
import { newSlide, saveFile, getContent, getFile, SlideContent } from "@/src/storage/db";
import { SlideView } from "@/src/components/slide-view";

export default function Templates() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ applyTo?: string }>();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | TemplateCategory>("All");
  const [previewTpl, setPreviewTpl] = useState<typeof TEMPLATES[number] | null>(null);

  const cats = useMemo(() => ["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))], []);
  const filtered = useMemo(() => TEMPLATES.filter((t) => (cat === "All" || t.category === cat) && (q ? t.name.toLowerCase().includes(q.toLowerCase()) || t.description.toLowerCase().includes(q.toLowerCase()) : true)), [cat, q]);

  const applyTemplate = async () => {
    if (!previewTpl) return;
    try {
      if (params.applyTo) {
        const meta = await getFile(String(params.applyTo));
        const content = await getContent<SlideContent>(String(params.applyTo));
        if (!meta || !content) {
          toast.show("Could not open the presentation", "error");
          return;
        }
        const newContent = buildFromTemplate(previewTpl, meta.title);
        const ok = await saveFile({ ...meta, updatedAt: Date.now() }, newContent);
        if (!ok) {
          toast.show("Could not apply the template", "error");
          return;
        }
        toast.show("Template applied", "success");
        setPreviewTpl(null);
        router.replace(`/slides/${meta.id}` as any);
        return;
      }
      const { meta, content } = newSlide(previewTpl.name);
      const nextContent = buildFromTemplate(previewTpl, meta.title);
      const ok = await saveFile(meta, nextContent);
      if (!ok) {
        toast.show("Could not create the presentation", "error");
        return;
      }
      toast.show("Presentation created", "success");
      setPreviewTpl(null);
      router.replace(`/slides/${meta.id}` as any);
    } catch (error) {
      console.warn("[templates] apply failed", error);
      toast.show("Could not apply the template", "error");
    }
  };

  const tw = Math.min((Dimensions.get("window").width - 48) / 2, 220);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="tpl-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Slide Templates</AppText>
      </View>

      <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Icon name="magnify" size={18} color={colors.muted} />
        <TextInput testID="tpl-search" value={q} onChangeText={setQ} placeholder="Search templates" placeholderTextColor={colors.muted} returnKeyType="search" style={{ flex: 1, color: colors.onSurface, fontSize: 14 }} />
      </View>

      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 52 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center", paddingVertical: 8 }}>
        {cats.map((c) => (
          <TouchableOpacity key={c} testID={`tpl-cat-${c}`} onPress={() => setCat(c as any)} style={[styles.chip, { backgroundColor: cat === c ? colors.brandPrimary : colors.surfaceSecondary, borderColor: colors.border, flexShrink: 0 }]}>
            <AppText style={{ color: cat === c ? colors.onBrandPrimary : colors.onSurface, fontSize: 13, fontWeight: "600" }}>{c}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {filtered.map((t) => {
            const preview = t.build(t.name)[0];
            return (
              <TouchableOpacity key={t.id} testID={`tpl-${t.id}`} activeOpacity={0.85} onPress={() => setPreviewTpl(t)} style={{ width: tw }}>
                <Card style={{ padding: 10 }}>
                  <View style={{ borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: t.theme.bg }}>
                    <SlideView slide={preview} theme={t.theme} width={tw - 20} height={(tw - 20) * (9 / 16)} interactive={false} />
                  </View>
                  <AppText variant="title" style={{ marginTop: 8 }} numberOfLines={1}>{t.name}</AppText>
                  <AppText variant="caption" numberOfLines={2}>{t.description}</AppText>
                  <View style={{ marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandTertiary, alignSelf: "flex-start" }}>
                    <AppText style={{ fontSize: 11, fontWeight: "600", color: colors.onBrandTertiary }}>{t.category}</AppText>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      </KeyboardAvoid>

      <BottomSheet visible={!!previewTpl} onClose={() => setPreviewTpl(null)} title={previewTpl?.name}>
        {previewTpl ? (
          <>
            <ScrollView style={{ maxHeight: 320 }}>
              {previewTpl.build(previewTpl.name).map((s) => (
                <View key={s.id} style={{ marginBottom: 10, alignItems: "center" }}>
                  <SlideView slide={s} theme={previewTpl.theme} width={280} height={280 * (9 / 16)} interactive={false} />
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button title="Cancel" kind="secondary" onPress={() => setPreviewTpl(null)} style={{ flex: 1 }} testID="tpl-cancel" />
              <Button title={params.applyTo ? "Apply to slides" : "Create presentation"} onPress={applyTemplate} style={{ flex: 1 }} testID="tpl-apply" />
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: radius.md, borderWidth: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
});
