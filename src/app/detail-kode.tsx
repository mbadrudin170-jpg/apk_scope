import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getInstalledApkFileContent } from "../../modules/installed-apps/src";

export default function DetailKode() {
  const { file, packageName } = useLocalSearchParams<{
    file?: string | string[];
    packageName?: string | string[];
  }>();
  const fileName = Array.isArray(file) ? file[0] : file;
  const pkg = Array.isArray(packageName) ? packageName[0] : packageName;

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setContent(null);
    setError("");

    if (!pkg || !fileName) {
      setLoading(false);
      setError("File atau package tidak tersedia.");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    getInstalledApkFileContent(pkg, fileName)
      .then((result) => {
        if (!active) return;
        if (!result) {
          setError("File tidak ditemukan di APK terpasang.");
        } else if (result.error) {
          setError(result.error);
        } else if (result.content === null) {
          setError("Konten file tidak tersedia.");
        } else {
          setContent(result.content);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Gagal membaca file.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pkg, fileName]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Detail File</Text>
        <Text style={styles.subtitle}>{fileName ?? "File tidak dipilih"}</Text>
        {loading ? (
          <ActivityIndicator color="#8EAEFF" style={styles.loader} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ScrollView style={styles.codeScroll}>
            <Text selectable style={styles.code}>
              {content}
            </Text>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0B1020" },
  container: { flex: 1, padding: 16 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginBottom: 4 },
  subtitle: {
    color: "#8EAEFF",
    fontSize: 13,
    marginBottom: 12,
    fontFamily: "monospace",
  },
  loader: { marginTop: 30 },
  error: { color: "#FF9292", marginTop: 12 },
  codeScroll: {
    flex: 1,
    backgroundColor: "#151D31",
    borderRadius: 10,
    padding: 12,
  },
  code: { color: "#C9D4EA", fontSize: 11, fontFamily: "monospace" },
});