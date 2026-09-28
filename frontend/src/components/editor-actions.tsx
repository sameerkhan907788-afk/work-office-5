import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { AppText } from "@/src/components/app-text";
import { BottomSheet } from "@/src/components/bottom-sheet";
import { Button } from "@/src/components/button";
import { useTheme, spacing } from "@/src/theme";

export type EditorExportOption = { id: string; title: string; subtitle: string; onPress: () => void | Promise<void> };

export function EditorActions({ onSave, exports }: { onSave: () => void | Promise<void>; exports: EditorExportOption[] }) {
  const { colors } = useTheme();
  const [shareVisible, setShareVisible] = useState(false);

  const runExport = async (option: EditorExportOption) => {
    setShareVisible(false);
    try {
      await option.onPress();
    } catch (error) {
      console.warn("[editor-actions] export action failed", error);
    }
  };

  return (
    <>
      <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
        <Button title="Save" icon="content-save-outline" size="sm" onPress={onSave} style={styles.action} testID="editor-save" />
        <Button title="Share" icon="share-variant" size="sm" kind="secondary" onPress={() => setShareVisible(true)} style={styles.action} testID="editor-share" />
      </View>
      <BottomSheet visible={shareVisible} onClose={() => setShareVisible(false)} title="Share or export">
        <AppText variant="muted" style={styles.help}>Choose an offline file format. Native devices open the system share sheet; browser preview downloads the file.</AppText>
        <View style={styles.options}>
          {exports.map((option) => (
            <Button key={option.id} title={option.title} icon="file-export-outline" onPress={() => { void runExport(option); }} style={styles.option} testID={`editor-export-${option.id}`} />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  action: { flex: 1 },
  help: { lineHeight: 20, marginBottom: spacing.md },
  options: { gap: spacing.sm },
  option: { width: "100%" },
});
