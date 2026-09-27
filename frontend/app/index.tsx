import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { BrandMark } from "@/src/components/brand-mark";
import { Card } from "@/src/components/card";
import { useTheme, spacing, radius } from "@/src/theme";
import { deleteFile, FileMeta, listFiles, listWorkspaces, newDoc, newSheet, newSlide, saveFile, updateMeta, Workspace, purgeFile } from "@/src/storage/db";
import { unreadNotificationCount } from "@/src/notifications/local";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { KeyboardAvoid, SCROLL_KEYBOARD_PROPS, dismissKeyboard } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";

const MODULES = [
  { key: "doc", label: "Document", icon: "file-document-outline", color: "#FF5E00", desc: "Create, edit and manage documents" },
  { key: "sheet", label: "Spreadsheet", icon: "table", color: "#22C55E", desc: "Create, analyze and format spreadsheets" },
  { key: "slide", label: "Presentation", icon: "presentation", color: "#7C3AED", desc: "Design presentations and share" },
] as const;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();

  const [files, setFiles] = useState<FileMeta[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"all" | "doc" | "sheet" | "slide" | "favorite" | "trash">("all");
  const [longPressed, setLongPressed] = useState<FileMeta | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [f, w, unread] = await Promise.all([listFiles(), listWorkspaces(), unreadNotificationCount()]);
      setFiles(f);
      setWorkspaces(w);
      setUnreadCount(unread);
    } catch {
      toast.show("Your local workspace could not be loaded", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    let list = files;
    if (tab === "trash") list = list.filter((f) => f.trashed);
    else list = list.filter((f) => !f.trashed);
    if (tab === "doc" || tab === "sheet" || tab === "slide") list = list.filter((f) => f.type === tab);
    if (tab === "favorite") list = list.filter((f) => f.favorite);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q));
    }
    return list;
  }, [files, tab, query]);

  const createFile = useCallback(async (type: "doc" | "sheet" | "slide") => {
    try {
      const created = type === "doc" ? newDoc() : type === "sheet" ? newSheet() : newSlide();
      await saveFile(created.meta, created.content);
      toast.show("Created", "success");
      router.push(`/${type === "doc" ? "docs" : type === "sheet" ? "sheets" : "slides"}/${created.meta.id}` as any);
    } catch {
      toast.show("Could not create that file. Try again.", "error");
    }
  }, [router, toast]);

  const recent = files.filter((f) => !f.trashed).slice(0, 6);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView
        {...SCROLL_KEYBOARD_PROPS}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandHeader}>
            <BrandMark size={42} />
            <View>
              <AppText variant="muted">Welcome back</AppText>
              <AppText variant="h1" testID="home-title">Jarvis Office</AppText>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push("/notifications" as any)} testID="notifications-button" accessibilityLabel="Notifications" style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name="bell-outline" size={22} color={colors.onSurface} />
              {unreadCount > 0 ? <View style={[styles.badge, { backgroundColor: colors.brandPrimary }]}><AppText style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</AppText></View> : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/settings" as any)} testID="settings-button" accessibilityLabel="Settings" style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name="cog-outline" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="search-input"
            placeholder="Search files"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.onSurface }]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          <View style={[styles.offlineBadge, { backgroundColor: colors.brandTertiary }]}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <AppText variant="caption" color={colors.onBrandTertiary}>Offline ready</AppText>
          </View>
        </View>

        <AppText variant="h3" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Create new</AppText>
        <View style={styles.modulesRow}>
          {MODULES.map((m) => (
            <TouchableOpacity
              key={m.key}
              testID={`create-${m.key}`}
              activeOpacity={0.85}
              onPress={() => createFile(m.key)}
              style={[styles.moduleCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <View style={[styles.moduleIcon, { backgroundColor: m.color + "22" }]}>
                <Icon name={m.icon as any} size={28} color={m.color} />
              </View>
              <AppText variant="title" style={{ marginTop: 8 }}>{m.label}</AppText>
              <AppText variant="caption" style={{ marginTop: 4, textAlign: "center" }}>{m.desc}</AppText>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.quickRow, { marginTop: spacing.xl }]}>
          <QuickTile label="Templates" icon="palette-outline" onPress={() => router.push("/templates" as any)} testID="quick-templates" />
          <QuickTile label="Workspaces" icon="folder-multiple-outline" onPress={() => router.push("/workspaces" as any)} testID="quick-workspaces" />
          <QuickTile label="Trash" icon="trash-can-outline" onPress={() => setTab("trash")} testID="quick-trash" />
        </View>

        {recent.length > 0 ? (
          <>
            <AppText variant="h3" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Recent</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
              {recent.map((f) => <RecentTile key={f.id} file={f} onOpen={() => openFile(f, router)} />)}
            </ScrollView>
          </>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl }}>
          <AppText variant="h3">All files</AppText>
          <AppText variant="muted">{filtered.length}</AppText>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
          {(["all", "doc", "sheet", "slide", "favorite", "trash"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              testID={`filter-${t}`}
              onPress={() => setTab(t)}
              style={[styles.chip, { backgroundColor: tab === t ? colors.brandPrimary : colors.surfaceSecondary, borderColor: colors.border, flexShrink: 0 }]}
            >
              <AppText style={{ color: tab === t ? colors.onBrandPrimary : colors.onSurface, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>
                {t === "all" ? "All" : t === "doc" ? "Document" : t === "sheet" ? "Spreadsheet" : t === "slide" ? "Presentation" : t}
              </AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ marginTop: spacing.md, gap: 10 }}>
          {filtered.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              workspaces={workspaces}
              onOpen={() => openFile(f, router)}
              onLongPress={() => setLongPressed(f)}
            />
          ))}
          {filtered.length === 0 ? (
            <Card>
              <AppText style={{ textAlign: "center" }}>No files yet. Create a new document, sheet or slide above.</AppText>
            </Card>
          ) : null}
        </View>
      </ScrollView>
      </KeyboardAvoid>

      <BottomSheet visible={!!longPressed} onClose={() => setLongPressed(null)} title={longPressed?.title}>
        {longPressed ? (
          <View style={{ gap: 10 }}>
            <Button
              title={longPressed.favorite ? "Unfavorite" : "Favorite"}
              icon={longPressed.favorite ? "star" : "star-outline"}
              kind="secondary"
              onPress={async () => { await updateMeta(longPressed.id, { favorite: !longPressed.favorite }); setLongPressed(null); load(); }}
              testID="menu-favorite"
            />
            <Button
              title="Rename"
              icon="pencil-outline"
              kind="secondary"
              onPress={() => { setLongPressed(null); router.push(`/rename/${longPressed.id}` as any); }}
              testID="menu-rename"
            />
            <Button
              title="Duplicate"
              icon="content-duplicate"
              kind="secondary"
              onPress={async () => {
                const { getContent, saveFile: sf } = await import("@/src/storage/db");
                const content = await getContent(longPressed.id);
                const { genId } = await import("@/src/storage/db");
                const meta = { ...longPressed, id: genId(), title: longPressed.title + " (copy)", createdAt: Date.now(), updatedAt: Date.now() };
                await sf(meta, content);
                setLongPressed(null); toast.show("Duplicated", "success"); load();
              }}
              testID="menu-duplicate"
            />
            {longPressed.trashed ? (
              <>
                <Button title="Restore" icon="restore" onPress={async () => { await updateMeta(longPressed.id, { trashed: false }); setLongPressed(null); toast.show("Restored", "success"); load(); }} testID="menu-restore" />
                <Button title="Delete forever" icon="trash-can" kind="danger" onPress={async () => { await purgeFile(longPressed.id); setLongPressed(null); toast.show("Deleted", "success"); load(); }} testID="menu-purge" />
              </>
            ) : (
              <Button title="Move to trash" icon="trash-can-outline" kind="danger" onPress={async () => { await deleteFile(longPressed.id); setLongPressed(null); toast.show("Moved to trash", "success"); load(); }} testID="menu-delete" />
            )}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function openFile(f: FileMeta, router: any) {
  // Dismiss the search keyboard before pushing the editor; Home stays mounted
  // in the stack and the keyboard must not linger over the next screen.
  dismissKeyboard();
  const path = f.type === "doc" ? "docs" : f.type === "sheet" ? "sheets" : "slides";
  router.push(`/${path}/${f.id}` as any);
}

function QuickTile({ label, icon, onPress, testID }: { label: string; icon: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.85} style={[styles.quickTile, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Icon name={icon as any} size={22} color={colors.brandPrimary} />
      <AppText variant="label" style={{ marginTop: 6 }}>{label}</AppText>
    </TouchableOpacity>
  );
}

function RecentTile({ file, onOpen }: { file: FileMeta; onOpen: () => void }) {
  const { colors } = useTheme();
  const iconName = file.type === "doc" ? "file-document-outline" : file.type === "sheet" ? "table" : "presentation";
  const iconColor = file.type === "doc" ? "#FF5E00" : file.type === "sheet" ? "#22C55E" : "#7C3AED";
  return (
    <TouchableOpacity onPress={onOpen} testID={`recent-${file.id}`} activeOpacity={0.85} style={[styles.recentTile, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <View style={[styles.recentIcon, { backgroundColor: iconColor + "22" }]}>
        <Icon name={iconName as any} size={22} color={iconColor} />
      </View>
      <AppText variant="label" numberOfLines={2}>{file.title}</AppText>
      <AppText variant="caption">{new Date(file.updatedAt).toLocaleDateString()}</AppText>
    </TouchableOpacity>
  );
}

function FileRow({ file, workspaces, onOpen, onLongPress }: { file: FileMeta; workspaces: Workspace[]; onOpen: () => void; onLongPress: () => void }) {
  const { colors } = useTheme();
  const iconName = file.type === "doc" ? "file-document-outline" : file.type === "sheet" ? "table" : "presentation";
  const iconColor = file.type === "doc" ? "#FF5E00" : file.type === "sheet" ? "#22C55E" : "#7C3AED";
  const ws = workspaces.find((w) => w.id === file.workspaceId);
  return (
    <TouchableOpacity onPress={onOpen} onLongPress={onLongPress} activeOpacity={0.8} testID={`file-${file.id}`}>
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.fileIcon, { backgroundColor: iconColor + "22" }]}>
            <Icon name={iconName as any} size={22} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>{file.title}</AppText>
            <AppText variant="caption">
              {new Date(file.updatedAt).toLocaleString()}{ws ? ` · ${ws.name}` : ""}
            </AppText>
          </View>
          {file.favorite ? <Icon name="star" size={18} color={colors.warning} /> : null}
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md },
  brandHeader: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  search: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1, gap: 8, marginTop: spacing.sm },
  searchInput: { flex: 1, fontSize: 15 },
  offlineBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  modulesRow: { flexDirection: "row", gap: 10 },
  moduleCard: { flex: 1, borderWidth: 1, borderRadius: radius.xl, padding: 14, alignItems: "center" },
  moduleIcon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", gap: 10 },
  quickTile: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: 14, alignItems: "center" },
  recentTile: { width: 150, borderRadius: radius.lg, borderWidth: 1, padding: 12, gap: 6 },
  recentIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  fileIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
