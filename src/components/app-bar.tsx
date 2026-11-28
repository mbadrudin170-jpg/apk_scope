import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type AppBarProps = {
  title?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  bottom?: React.ReactNode;
  centerTitle?: boolean;
  backgroundColor?: string;
  elevation?: number;
};

export function AppBar({
  title,
  leading,
  actions,
  bottom,
  centerTitle = false,
  backgroundColor = "transparent",
}: AppBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: insets.top,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.leading}>{leading}</View>
        <View style={[styles.title, centerTitle && styles.titleCentered]}>
          {typeof title === "string" ? (
            <Text style={styles.titleText}>{title}</Text>
          ) : (
            title
          )}
        </View>
        <View style={styles.actions}>{actions}</View>
      </View>
      {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 12,
  },
  leading: {
    width: 40,
    alignItems: "flex-start",
  },
  title: {
    flex: 1,
    alignItems: "flex-start",
  },
  titleCentered: {
    alignItems: "center",
  },
  titleText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bottom: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
