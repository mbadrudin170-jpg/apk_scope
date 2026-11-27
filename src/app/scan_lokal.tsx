import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getInstalledApps } from "../../modules/installed-apps/src";

type App = ReturnType<typeof getInstalledApps>[number];

export default function ScanLokal() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    try {
      setApps(getInstalledApps(false));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat app");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={apps}
        keyExtractor={(item) => item.packageName}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.appName}</Text>
            <Text style={styles.sub}>
              {item.packageName} · {item.versionName ?? "?"}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderColor: "#222" },
  name: { color: "#fff", fontWeight: "700" },
  sub: { color: "#aaa", fontSize: 12, marginTop: 2 },
  error: { color: "#f99", marginBottom: 8 },
});
