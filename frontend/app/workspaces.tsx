import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { Card } from "@/src/components/card";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { SCROLL_KEYBOARD_PROPS } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme, radius } from "@/src/theme";
import { FileMeta, Workspace, deleteWorkspace, genId, listFiles, listWorkspaces, saveWorkspace } from "@/src/storage/db";

const COLORS = ["#FF5E00", "#22C55E", "#3B82F6", "#A855F7", "#EAB308", "#EC4899", "#06B6D4", "#F97316"];

export default function Workspaces() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [ws, setWs] = useState<Workspace[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const load = useCallback(async () => {
    const [w, f] = await Promise.all([listWorkspaces(), listFiles()]);
    setWs(w); setFiles(f);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    await saveWorkspace({ id: genId(), name: name.trim(), color, createdAt: Date.now() });
    setName(""); setNewOpen(false); toast.show("Workspace created", "success"); load();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} testID="ws-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Workspaces</AppText>
        <TouchableOpacity onPress={() => setNewOpen(true)} testID="ws-new"><Icon name="plus" size={24} color={colors.brandPrimary} /></TouchableOpacity>
      </View>

      <ScrollView {...SCROLL_KEYBOARD_PROPS} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
        {ws.length === 0 ? (
          <Card><AppText style={{ textAlign: "center" }}>No workspaces yet. Create one to group related files.</AppText></Card>
        ) : ws.map((w) => {
          const wsFiles = files.filter((f) => f.workspaceId === w.id && !f.trashed);
          return (
            <TouchableOpacity key={w.id} onPress={() => router.push(`/workspaces/${w.id}` as any)} testID={`ws-${w.id}`} activeOpacity={0.85}>
              <Card style={{ padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: w.color + "22", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="folder-outline" size={22} color={w.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="title">{w.name}</AppText>
                    <AppText variant="caption">{wsFiles.length} files</AppText>
                  </View>
                  <TouchableOpacity onPress={async () => { await deleteWorkspace(w.id); load(); }} testID={`ws-del-${w.id}`}><Icon name="trash-can-outline" size={20} color={colors.error} /></TouchableOpacity>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <BottomSheet visible={newOpen} onClose={() => setNewOpen(false)} title="New workspace">
        <TextInput testID="ws-name" value={name} onChangeText={setName} placeholder="Workspace name" placeholderTextColor={colors.muted}
          returnKeyType="done" onSubmitEditing={() => { void create(); }} blurOnSubmit
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, color: colors.onSurface }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {COLORS.map((c) => (
            <TouchableOpacity key={c} testID={`ws-color-${c}`} onPress={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.onSurface }} />
          ))}
        </View>
        <Button title="Create" onPress={create} style={{ marginTop: 12 }} testID="ws-create" />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
});
