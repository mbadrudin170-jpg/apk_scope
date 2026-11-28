import type React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type MainAxisAlignment =
  | "start"
  | "end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly";

export type CrossAxisAlignment = "start" | "end" | "center" | "stretch" | "baseline";

export type ColumnProps = {
  children: React.ReactNode;
  gap?: number;
  mainAxisAlignment?: MainAxisAlignment;
  crossAxisAlignment?: CrossAxisAlignment;
  style?: StyleProp<ViewStyle>;
};

const justifyMap: Record<MainAxisAlignment, ViewStyle["justifyContent"]> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
};

const alignMap: Record<CrossAxisAlignment, ViewStyle["alignItems"]> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
  baseline: "baseline",
};

export function Column({
  children,
  gap = 0,
  mainAxisAlignment = "start",
  crossAxisAlignment = "stretch",
  style,
}: ColumnProps) {
  return (
    <View
      style={[
        styles.base,
        { justifyContent: justifyMap[mainAxisAlignment], alignItems: alignMap[crossAxisAlignment], gap },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "column",
  },
});
