import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getApkInfo,
  getInstalledApps,
  type InstalledApp,
} from "../../../modules/installed-apps/src";

export default function ScanLokal() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const analyzeApk = async () => {
    setAnalyzing(true);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: "application/vnd.android.package-archive",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;

      const asset = selection.assets[0];
      if (!asset) {
        Alert.alert("Gagal", "File APK tidak ditemukan.");
        return;
      }

      const info = await getApkInfo(asset.uri);
      if (!info) {
        Alert.alert("Gagal", "APK tidak valid atau tidak dapat dibaca.");
        return;
      }

      const resultText = [
        `Nama: ${info.appName}`,
        `Package: ${info.packageName}`,
        `Versi: ${info.versionName ?? "-"} (${info.versionCode})`,
        `minSdk: ${info.minSdk} · targetSdk: ${info.targetSdk}`,
        `Permissions: ${info.permissions.length}`,
        `Native libs: ${info.nativeLibs.length}`,
        `Semua file: ${info.allFiles?.length ?? 0}`,
        `File APK: ${info.apkFiles.length}`,
      ].join("\n");

      Alert.alert("Hasil analisis APK", resultText);
    } catch (cause) {
      Alert.alert(
        "Gagal",
        cause instanceof Error ? cause.message : "Analisis APK gagal.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    getInstalledApps(false)
      .then((installedApps) => {
        if (mounted) {
          const sorted = [...installedApps].sort((a, b) =>
            a.appName.localeCompare(b.appName, undefined, {
              sensitivity: "base",
            }),
          );
          setApps(sorted);
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

            <Pressable
              onPress={() => void analyzeApk()}
              disabled={analyzing}
              style={[styles.analyzeButton, analyzing && styles.disabledButton]}
            >
              <Text style={styles.analyzeText}>
                {analyzing ? "Menganalisis..." : "Analisis file APK"}
              </Text>
            </Pressable>

            <FlatList
              data={apps}
              keyExtractor={(item) => item.packageName}
              ListEmptyComponent={
                error ? undefined : (
                  <Text style={styles.empty}>
                    Tidak ada aplikasi yang dapat ditampilkan.
                  </Text>
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/detail-apk",
                      params: { packageName: item.packageName },
                    })
                  }
                >
                  <View style={styles.row}>
                    <Text style={styles.name}>{item.appName}</Text>
                    <Text style={styles.sub}>
                      {item.packageName} ·{" "}
                      {item.versionName ?? "Versi tidak diketahui"}
                    </Text>
                  </View>
                </Pressable>
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
  analyzeButton: {
    backgroundColor: "#4778F5",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  disabledButton: { opacity: 0.6 },
  analyzeText: { color: "#FFFFFF", fontWeight: "700" },
});
