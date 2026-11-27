import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getInstalledApkInfo, type ApkInfo } from "../../modules/installed-apps/src";

const PAGE_SIZE = 100;

export default function FileExplorer() {
  const { packageName } = useLocalSearchParams<{ packageName?: string }>();
  const [info, setInfo] = useState<ApkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!packageName) {
      setError("Package aplikasi tidak tersedia.");
      setLoading(false);
      return;
    }
    let active = true;
    getInstalledApkInfo(packageName)
      .then((result) => {
        if (active) setInfo(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Gagal membaca file APK");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [packageName]);

  const filtered = useMemo(
    () => (info?.allFiles ?? []).filter((file) => file.toLowerCase().includes(query.trim().toLowerCase())),
    [info, query],
  );
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>File Explorer</Text>
        <Text style={styles.subtitle}>{packageName ?? ""}</Text>
        <TextInput
          value={query}
          onChangeText={(value) => { setQuery(value); setPage(0); }}
          placeholder="Cari nama atau lokasi file..."
          placeholderTextColor="#8995AC"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
        {loading ? (
          <ActivityIndicator color="#8EAEFF" style={styles.loading} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <Text style={styles.count}>{filtered.length.toLocaleString("id-ID")} file ditemukan</Text>
            <FlatList
              data={visible}
              keyExtractor={(item, index) => item + ":" + index}
              initialNumToRender={20}
              maxToRenderPerBatch={30}
              windowSize={7}
              renderItem={({ item }) => (
                <View style={styles.fileRow}>
                  <Text style={styles.fileName}>{item.split("/").pop() ?? item}</Text>
                  <Text style={styles.filePath}>{item}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Tidak ada file yang cocok.</Text>}
            />
            <View style={styles.pagination}>
              <Text onPress={() => setPage(Math.max(0, page - 1))} style={[styles.button, page === 0 && styles.disabled]}>Sebelumnya</Text>
              <Text style={styles.count}>Halaman {page + 1} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}</Text>
              <Text onPress={() => setPage(Math.min(Math.ceil(filtered.length / PAGE_SIZE) - 1, page + 1))} style={[styles.button, (page + 1) * PAGE_SIZE >= filtered.length && styles.disabled]}>Berikutnya</Text>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1020" },
  container: { flex: 1, padding: 16 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#8995AC", fontSize: 11, marginTop: 5, marginBottom: 14 },
  search: { backgroundColor: "#151D31", borderColor: "#34425F", borderWidth: 1, borderRadius: 10, padding: 12, color: "#FFFFFF", marginBottom: 10 },
  loading: { marginTop: 30 },
  error: { color: "#FF9292" },
  count: { color: "#8995AC", fontSize: 11, marginBottom: 8 },
  fileRow: { paddingVertical: 9, borderBottomColor: "#26334D", borderBottomWidth: 1 },
  fileName: { color: "#F2F4FA", fontSize: 12, fontWeight: "700" },
  filePath: { color: "#8995AC", fontSize: 10, marginTop: 3, fontFamily: "monospace" },
  empty: { color: "#A8B1C5", textAlign: "center", marginTop: 30 },
  pagination: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, gap: 6 },
  button: { color: "#8EAEFF", fontSize: 11, fontWeight: "700", padding: 6 },
  disabled: { opacity: 0.3 },
});
