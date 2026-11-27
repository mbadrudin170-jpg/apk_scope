import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getInstalledApps,
  type InstalledApp,
} from "../../modules/installed-apps/src";

export default function ScanLokal() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    getInstalledApps(false)
      .then((installedApps) => {
        if (mounted) {
          setApps(installedApps);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(
            cause instanceof Error ? cause.message : "Gagal memuat aplikasi",
          );
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
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Aplikasi terpasang</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <FlatList
              data={apps}
              keyExtractor={(item) => item.packageName}
              ListEmptyComponent={
                error ? null : (
                  <Text style={styles.empty}>
                    Tidak ada aplikasi yang dapat ditampilkan.
                  </Text>
                )
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Text style={styles.name}>{item.appName}</Text>
                  <Text style={styles.sub}>
                    {item.packageName} · {item.versionName ?? "Versi tidak diketahui"}
                  </Text>
                </View>
              )}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0B1020" },
  container: { flex: 1, padding: 16 },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderColor: "#26334D" },
  name: { color: "#FFFFFF", fontWeight: "700" },
  sub: { color: "#A8B1C5", fontSize: 12, marginTop: 2 },
  empty: { color: "#A8B1C5", paddingVertical: 20, textAlign: "center" },
  error: { color: "#FF9292", marginBottom: 8 },
});
