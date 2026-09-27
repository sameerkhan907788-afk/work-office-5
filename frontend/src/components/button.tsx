import React from "react";
import { TouchableOpacity, StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./app-text";
import { useTheme, radius, spacing } from "@/src/theme";
import Icon from "@react-native-vector-icons/material-design-icons";

export function Button({ title, onPress, kind = "primary", icon, loading, disabled, style, testID, size = "md" }: {
  title: string; onPress?: () => void; kind?: "primary" | "secondary" | "ghost" | "danger";
  icon?: string; loading?: boolean; disabled?: boolean; style?: ViewStyle; testID?: string; size?: "sm" | "md" | "lg";
}) {
  const { colors } = useTheme();
  const bg =
    kind === "primary" ? colors.brandPrimary :
    kind === "danger" ? colors.error :
    kind === "secondary" ? colors.surfaceSecondary :
    "transparent";
  const fg =
    kind === "primary" ? colors.onBrandPrimary :
    kind === "danger" ? colors.onError :
    kind === "secondary" ? colors.onSurfaceSecondary :
    colors.brandPrimary;
  const border = kind === "secondary" ? colors.border : undefined;
  const pad = size === "sm" ? { px: 12, py: 8, fs: 13 } : size === "lg" ? { px: 20, py: 16, fs: 16 } : { px: 16, py: 12, fs: 15 };
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled || loading} activeOpacity={0.85}
      testID={testID}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, borderWidth: border ? 1 : 0, paddingHorizontal: pad.px, paddingVertical: pad.py, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <View style={styles.row}>
        {icon ? <Icon name={icon as any} size={pad.fs + 3} color={fg} /> : null}
        <AppText style={{ color: fg, fontSize: pad.fs, fontWeight: "600" }}>{title}</AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
