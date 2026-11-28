import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function Collapsible({
  children,
  title,
}: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.heading,
          pressed && styles.pressedHeading,
        ]}
        onPress={() => setIsOpen((value) => !value)}
      >
        <ThemedView type="backgroundElement" style={styles.button}>
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.text}
          />
        </ThemedView>

        <ThemedText type="small" style={styles.title}>
          {title}
        </ThemedText>
      </Pressable>

      {isOpen && (
        <Animated.View
          entering={FadeIn.duration(180)}
          layout={LinearTransition.springify().damping(18)}
        >
          <ThemedView
            style={[
              styles.content,
              { backgroundColor: "transparent", borderWidth: 0 },
            ]}
          >
            {children}
          </ThemedView>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(127, 127, 127, 0.18)",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  pressedHeading: {
    opacity: 0.75,
  },
  button: {
    width: Spacing.four + 4,
    height: Spacing.four + 4,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontWeight: "600",
  },
  content: {
    marginTop: 0,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: 12,
    padding: Spacing.half,
  },
});
