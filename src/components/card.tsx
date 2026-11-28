import type React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type CardVariant = "elevated" | "filled" | "outlined";

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  onPress,
  variant = "elevated",
  style,
}: CardProps) {
  const variantStyle =
    variant === "filled"
      ? styles.filled
      : variant === "outlined"
        ? styles.outlined
        : styles.elevated;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          variantStyle,
          style,
          pressed && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, variantStyle, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginVertical: 6,
  },
  elevated: {
    backgroundColor: "#151D31",
    borderWidth: 1,
    borderColor: "#26334D",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  filled: {
    backgroundColor: "#1E293B",
    borderWidth: 0,
  },
  outlined: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#3B4A6B",
  },
  pressed: {
    opacity: 0.85,
  },
});
