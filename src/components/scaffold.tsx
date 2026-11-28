import type React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type ScaffoldProps = {
  children: React.ReactNode;
  appBar?: React.ReactNode;
  floatingActionButton?: React.ReactNode;
  bottomNavigationBar?: React.ReactNode;
  backgroundColor?: string;
};

export function Scaffold({
  children,
  appBar,
  floatingActionButton,
  bottomNavigationBar,
}: ScaffoldProps) {
  return (
    <SafeAreaView style={[styles.safeArea]}>
      {appBar ? <View style={styles.appBar}>{appBar}</View> : null}
      <View style={styles.body}>{children}</View>
      {bottomNavigationBar ? (
        <View style={styles.bottomBar}>{bottomNavigationBar}</View>
      ) : null}
      {floatingActionButton ? (
        <View style={styles.fabContainer} pointerEvents="box-none">
          {floatingActionButton}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  appBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fabContainer: {
    position: "absolute",
    right: 16,
    bottom: 16,
  },
});
