import React, { useRef, useEffect } from "react";
import { Modal, View, StyleSheet, TouchableWithoutFeedback, Animated, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, radius, spacing } from "@/src/theme";
import { AppText } from "./app-text";
import { KeyboardModalAvoid, dismissKeyboard } from "./keyboard";
import Icon from "@react-native-vector-icons/material-design-icons";

export function BottomSheet({ visible, onClose, title, children, testID }: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible, anim]);

  // Closing a sheet always releases the keyboard first so it can never linger
  // over the screen underneath.
  const handleClose = () => {
    dismissKeyboard();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: anim }]} />
      </TouchableWithoutFeedback>
      <KeyboardModalAvoid style={styles.avoider}>
        <Animated.View
          testID={testID}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceSecondary,
              paddingBottom: insets.bottom + spacing.lg,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
            },
          ]}
        >
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <AppText variant="h3">{title}</AppText>
              <TouchableOpacity onPress={handleClose} testID="bottom-sheet-close">
                <Icon name="close" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </KeyboardModalAvoid>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.35)" },
  avoider: { flex: 1 },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md, paddingHorizontal: spacing.lg, maxHeight: "88%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D1D6", alignSelf: "center", marginBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.md },
});
