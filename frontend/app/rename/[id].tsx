import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { AppText } from "@/src/components/app-text";
import { Button } from "@/src/components/button";
import { KeyboardAvoid, dismissKeyboard, useDismissKeyboardOnUnmount } from "@/src/components/keyboard";
import { useToast } from "@/src/components/toast";
import { useTheme, radius } from "@/src/theme";
import { getFile, updateMeta } from "@/src/storage/db";

export default function Rename() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [title, setTitle] = useState("");

  // The input auto-focuses; never let the keyboard linger after leaving.
  useDismissKeyboardOnUnmount();

  useEffect(() => { (async () => { const m = await getFile(String(id)); if (m) setTitle(m.title); })(); }, [id]);

  const save = async () => {
    if (!title.trim()) return;
    dismissKeyboard();
    await updateMeta(String(id), { title: title.trim() });
    toast.show("Renamed", "success"); router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { dismissKeyboard(); router.back(); }} testID="rn-back"><Icon name="arrow-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <AppText variant="h3" style={{ flex: 1 }}>Rename</AppText>
      </View>
      <KeyboardAvoid style={{ flex: 1 }}>
      <View style={{ padding: 16, gap: 12 }}>
        <TextInput testID="rn-input" autoFocus value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.muted}
          returnKeyType="done" onSubmitEditing={() => { void save(); }} blurOnSubmit
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, color: colors.onSurface, fontSize: 16 }} />
        <Button title="Save" onPress={save} testID="rn-save" />
      </View>
      </KeyboardAvoid>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
});
