import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { Card } from "@/src/components/card";
import { useTheme } from "@/src/theme";
import { FileMeta, Workspace, getContent, listFiles, listWorkspaces, newDoc, newSheet, newSlide, saveFile, updateMeta } from "@/src/storage/db";
import { Button } from "@/src/components/button";
import { useToast } from "@/src/components/toast";
import * as AI from "@/src/ai/engine";

export default function WorkspaceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [ws, setWs] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  const load = useCallback(async () => {
    const [w, f] = await Promise.all([listWorkspaces(), listFiles()]);
    setWs(w.find((x) => x.id === id) || null);
    setFiles(f.filter((x) => x.workspaceId === id && !x.trashed));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const create = async (type: "doc" | "sheet" | "slide") => {
    const c = type === "doc" ? newDoc("Untitled", String(id)) : type === "sheet" ? newSheet("Untitled", String(id)) : newSlide("Untitled", String(id));
    await saveFile(c.meta, c.content);
    toast.show("Created", "success");
    router.push(`/${type === "doc" ? "docs" : type === "sheet" ? "sheets" : "slides"}/${c.meta.id}` as any);
  };

  const wsAgent = async () => {
    // Aggregate text from all workspace docs
    let allText = "";
    for (const f of files) {
      if (f.type !== "doc") continue;
      const c = await getContent<any>(f.id);
      if (c?.blocks) allText += "\n\n" + c.blocks.map((b: any) => b.text).join("\n");
    }
    if (!allText.trim()) { toast.show("No document content in this workspace", "info"); return; }
    const summary = AI.summarize(allText, 6);
    const { meta: dm, content: dc } = newDoc(`${ws?.name || "Workspace"} — Summary`, String(id));
    dc.blocks = [
      { id: dm.id + "-h", kind: "h1", text: dm.title },
      { id: dm.id + "-p", kind: "p", text: summary },
    ];
    await saveFile(dm, dc);
    toast.show("Workspace summary created", "success");
    router.push(`/docs/${dm.id}` as any);
  };

  if (!ws) return <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}><AppText>Workspace unavailable</AppText></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="wsd-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: ws.color + "22", alignItems: "center", justifyContent: "center" }}>
            <Icon name="folder-outline" size={18} color={ws.color} />
          </View>
          <AppText variant="h3">{ws.name}</AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title="Doc" icon="file-document-outline" size="sm" kind="secondary" onPress={() => create("doc")} style={{ flex: 1 }} testID="wsd-new-doc" />
          <Button title="Sheet" icon="table" size="sm" kind="secondary" onPress={() => create("sheet")} style={{ flex: 1 }} testID="wsd-new-sheet" />
          <Button title="Slide" icon="presentation" size="sm" kind="secondary" onPress={() => create("slide")} style={{ flex: 1 }} testID="wsd-new-slide" />
        </View>
        <Button title="Workspace AI: summarize all documents" icon="robot-outline" onPress={wsAgent} testID="wsd-ai" />

        {files.length === 0 ? <Card><AppText style={{ textAlign: "center" }}>No files in this workspace yet.</AppText></Card> :
          files.map((f) => {
            const iconName = f.type === "doc" ? "file-document-outline" : f.type === "sheet" ? "table" : "presentation";
            const iconColor = f.type === "doc" ? "#FF5E00" : f.type === "sheet" ? "#22C55E" : "#7C3AED";
            return (
              <TouchableOpacity key={f.id} testID={`wsd-file-${f.id}`} onPress={() => router.push(`/${f.type === "doc" ? "docs" : f.type === "sheet" ? "sheets" : "slides"}/${f.id}` as any)}>
                <Card style={{ padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: iconColor + "22", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={iconName as any} size={22} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="title" numberOfLines={1}>{f.title}</AppText>
                      <AppText variant="caption">{new Date(f.updatedAt).toLocaleString()}</AppText>
                    </View>
                    <Icon name="chevron-right" size={20} color={colors.muted} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
});
