import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getAppLibraries } from "../../modules/installed-apps/src";

export default function DetailApk() {
  const { packageName } = useLocalSearchParams<{
    packageName?: string;
  }>();
  const [libraries, setLibraries] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!packageName);
  const [error, setError] = useState(packageName ? "" : "Package tidak tersedia.");

  useEffect(() => {
    if (!packageName) return;

    let mounted = true;

    getAppLibraries(packageName)
      .then((libs) => {
        if (mounted) {
          setLibraries(libs);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : "Gagal memuat library");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [packageName]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Detail APK</Text>
        {packageName ? <Text style={styles.sub}>{packageName}</Text> : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            data={libraries}
            keyExtractor={(item, index) => `${item}-${index}`}
            ListEmptyComponent={
              <Text style={styles.empty}>Tidak ada library native yang ditemukan.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.lib}>{item}</Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  container: { flex: 1, padding: 16 },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  sub: {
    color: "#A8B1C5",
    fontSize: 12,
    marginBottom: 12,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#26334D",
  },
  lib: {
    color: "#FFFFFF",
    fontSize: 13,
  },
  empty: {
    color: "#A8B1C5",
    paddingVertical: 20,
    textAlign: "center",
  },
  error: {
    color: "#FF9292",
    marginTop: 8,
  },
});
