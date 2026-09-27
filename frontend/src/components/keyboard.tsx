// Shared keyboard helpers. Every keyboard interaction in the app goes through
// these utilities so a failing keyboard measurement, dismiss call, or avoiding
// view can never crash a screen or leave the UI blank — the guarded wrappers
// fall back to rendering children untouched.

import React, { Component, type ReactNode, useEffect } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from "react-native";

/** Props to spread on any ScrollView that coexists with an open keyboard. */
export const SCROLL_KEYBOARD_PROPS = {
  keyboardShouldPersistTaps: "handled",
  keyboardDismissMode: Platform.select<"interactive" | "on-drag">({ ios: "interactive", default: "on-drag" }),
} as const;

/** Dismiss the software keyboard; never throws. */
export function dismissKeyboard(): void {
  try {
    Keyboard.dismiss();
  } catch (error) {
    console.warn("[keyboard] dismiss failed:", error);
  }
}

/** Dismiss the keyboard when a screen unmounts (useful on autoFocus screens). */
export function useDismissKeyboardOnUnmount(): void {
  useEffect(() => () => dismissKeyboard(), []);
}

type GuardProps = { fallback: ReactNode; children: ReactNode };
type GuardState = { failed: boolean };

// If KeyboardAvoidingView itself ever throws (native measurement race, bad
// keyboard frame, etc.) render the children without avoidance instead of
// crashing the whole screen into the root error fallback.
class KeyboardAvoidGuard extends Component<GuardProps, GuardState> {
  state: GuardState = { failed: false };

  static getDerivedStateFromError(): GuardState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.error("[keyboard] avoiding view failed, rendering without avoidance:", error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Screen-level keyboard avoidance. On iOS the content is padded above the
 * keyboard; on Android the system window resize (adjustResize) handles it, so
 * no extra behavior is applied. Wrap scrollable/input regions with this and
 * add SCROLL_KEYBOARD_PROPS to the inner ScrollViews.
 */
export function KeyboardAvoid({ children, style, keyboardVerticalOffset = 0, enabled = true }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  enabled?: boolean;
}) {
  return (
    <KeyboardAvoidGuard fallback={children}>
      <KeyboardAvoidingView
        style={style}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
        enabled={enabled}
      >
        {children}
      </KeyboardAvoidingView>
    </KeyboardAvoidGuard>
  );
}

/**
 * Modal-level keyboard avoidance (bottom sheets, dialogs). Modal windows are
 * not reliably resized by the system, so an explicit behavior is applied on
 * both platforms to keep inputs visible above the keyboard.
 */
export function KeyboardModalAvoid({ children, style }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidGuard fallback={children}>
      <KeyboardAvoidingView
        style={style}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        pointerEvents="box-none"
      >
        {children}
      </KeyboardAvoidingView>
    </KeyboardAvoidGuard>
  );
}
