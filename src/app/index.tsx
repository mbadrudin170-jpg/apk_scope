import * as DocumentPicker from "expo-document-picker";
import { File, UploadType } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AnalysisItem } from "@/services/api/client";
import { fetchAnalyses, fetchAnalysis, uploadUrl } from "@/services/api/client";

const DEFAULT_API_URL = "";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: AnalysisItem["status"]): string {
  const labels: Record<AnalysisItem["status"], string> = {
    queued: "Menunggu",
    validating: "Validasi",
    analyzing: "Sedang dianalisis",
    enriching: "Menyiapkan hasil",
    completed: "Selesai",
    failed: "Gagal",
  };
  return labels[status] ?? status;
}

export default function HomeScreen() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiToken, setApiToken] = useState("");
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!apiUrl.trim()) {
      setError("");
      return;
    }
    try {
      const items = await fetchAnalyses(apiUrl, apiToken);
      setAnalyses(items);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tidak dapat menghubungi backend",
      );
    }
  }, [apiUrl, apiToken]);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);

  const chooseAndUpload = async () => {
    if (!apiUrl.trim()) {
      Alert.alert("Alamat backend belum diisi");
      return;
    }
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: "application/vnd.android.package-archive",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;

      const asset = selection.assets[0];
      if (!asset.name.toLowerCase().endsWith(".apk")) {
        Alert.alert(
          "Format tidak didukung",
          "Pilih file dengan ekstensi .apk.",
        );
        return;
      }

      setBusy(true);
      setSelectedName(asset.name);
      setUploadProgress(0);
      setError("");

      const file = new File(asset.uri);
      const task = file.createUploadTask(uploadUrl(apiUrl.trim()), {
        fieldName: "file",
        mimeType: "application/vnd.android.package-archive",
        uploadType: UploadType.MULTIPART,
        headers: apiToken.trim()
          ? { Authorization: `Bearer ${apiToken.trim()}` }
          : {},
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) {
            setUploadProgress(
              Math.min(100, Math.round((bytesSent / totalBytes) * 100)),
            );
          }
        },
      });
      const result = await task.uploadAsync();
      if (!result)
        throw new Error("Upload dibatalkan atau tidak menghasilkan respons");
      if (result.status < 200 || result.status >= 300) {
        throw new Error(result.body || `Upload gagal (${result.status})`);
      }
      await refresh();
      Alert.alert("APK berhasil dikirim", "Backend mulai memproses analisis.");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Upload APK gagal";
      setError(message);
      Alert.alert("Gagal mengirim APK", message);
    } finally {
      setBusy(false);
    }
  };

  const openReport = async (item: AnalysisItem) => {
    if (item.status !== "completed") {
      Alert.alert(item.filename, item.error_message || item.progress_message);
      return;
    }
    try {
      const detail = await fetchAnalysis(apiUrl, item.id, apiToken);
      const report = detail.report;
      const appName =
        typeof report?.["app_name"] === "string"
          ? report["app_name"]
          : "Nama aplikasi tidak tersedia";
      const packageName =
        typeof report?.["package_name"] === "string"
          ? report["package_name"]
          : "Package tidak tersedia";
      Alert.alert(
        "Ringkasan APK",
        `${appName}\n${packageName}\nSHA-256: ${detail.sha256}`,
      );
    } catch (cause) {
      Alert.alert(
        "Gagal membuka laporan",
        cause instanceof Error ? cause.message : "Kesalahan",
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>APK ANALYSIS WORKSPACE</Text>
        <Text style={styles.title}>APK Scope</Text>
        <Text style={styles.subtitle}>
          Analisis APK pribadi melalui server MobSF milikmu.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Alamat backend</Text>
        <TextInput
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://alamat-ip-server:8000"
          placeholderTextColor="#778197"
          style={styles.input}
        />
        <Text style={styles.helper}>
          Gunakan alamat IP server yang dapat dijangkau HP, bukan 127.0.0.1.
        </Text>
        <Text style={[styles.label, { marginTop: 14 }]}>
          Token akses backend
        </Text>
        <TextInput
          value={apiToken}
          onChangeText={setApiToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Token dari backend/.env"
          placeholderTextColor="#778197"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={chooseAndUpload}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Pilih dan analisis APK</Text>
          )}
        </Pressable>
        {busy && (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${uploadProgress}%` }]}
            />
          </View>
        )}
        {busy && (
          <Text style={styles.helper}>
            Mengunggah {selectedName} · {uploadProgress}%
          </Text>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Riwayat analisis</Text>
        <Pressable onPress={() => void refresh()} accessibilityRole="button">
          <Text style={styles.refresh}>Muat ulang</Text>
        </Pressable>
      </View>

      {analyses.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Belum ada analisis</Text>
          <Text style={styles.helper}>
            APK yang berhasil dikirim akan muncul di sini.
          </Text>
        </View>
      ) : (
        analyses.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => void openReport(item)}
            style={({ pressed }) => [
              styles.analysisCard,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.fileName} numberOfLines={1}>
                {item.filename}
              </Text>
              <Text
                style={[
                  styles.status,
                  item.status === "completed" && styles.statusDone,
                  item.status === "failed" && styles.statusFailed,
                ]}
              >
                {statusLabel(item.status)}
              </Text>
            </View>
            <Text style={styles.helper}>
              {formatSize(item.file_size)} · {item.progress_message}
            </Text>
            {item.error_message ? (
              <Text style={styles.error} numberOfLines={2}>
                {item.error_message}
              </Text>
            ) : null}
          </Pressable>
        ))
      )}
      <Text style={styles.footer}>APK Scope · Personal static analysis</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 22,
    paddingTop: 34,
    paddingBottom: 48,
    backgroundColor: "#0B1020",
  },
  header: { marginBottom: 24 },
  eyebrow: {
    color: "#7C9BFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  title: { color: "#F4F6FC", fontSize: 34, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#A8B1C5", fontSize: 14, lineHeight: 21, marginTop: 8 },
  panel: {
    backgroundColor: "#151D31",
    borderColor: "#26334D",
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
  },
  label: { color: "#E8ECF6", fontSize: 13, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: "#0D1425",
    borderColor: "#34425F",
    borderWidth: 1,
    borderRadius: 10,
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  helper: { color: "#8995AC", fontSize: 12, lineHeight: 18, marginTop: 8 },
  primaryButton: {
    minHeight: 48,
    marginTop: 16,
    backgroundColor: "#4778F5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  buttonPressed: { opacity: 0.72 },
  progressTrack: {
    height: 6,
    borderRadius: 5,
    backgroundColor: "#293650",
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: "#78A0FF" },
  error: { color: "#FF9292", fontSize: 12, marginTop: 10, lineHeight: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { color: "#F4F6FC", fontSize: 18, fontWeight: "800" },
  refresh: { color: "#8EAEFF", fontSize: 13, fontWeight: "700" },
  empty: {
    padding: 22,
    borderRadius: 14,
    borderColor: "#26334D",
    borderWidth: 1,
    alignItems: "center",
  },
  emptyTitle: { color: "#DCE3F2", fontSize: 14, fontWeight: "700" },
  analysisCard: {
    backgroundColor: "#151D31",
    borderColor: "#26334D",
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  fileName: { flex: 1, color: "#F2F4FA", fontSize: 14, fontWeight: "700" },
  status: { color: "#E9C477", fontSize: 11, fontWeight: "800" },
  statusDone: { color: "#7ED8A5" },
  statusFailed: { color: "#FF9292" },
  footer: {
    color: "#66738D",
    textAlign: "center",
    fontSize: 11,
    marginTop: 28,
  },
});
