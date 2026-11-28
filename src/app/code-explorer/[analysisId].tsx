import { useLocalSearchParams } from "expo-router";
import { getApiConfig } from "@/services/api/config";
import {
  fetchDecompilationStatus,
  fetchSourceFile,
  fetchSourceFiles,
  startDecompilation,
  type DecompileStatus,
  type SourceFile,
} from "@/services/api/client";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Tool = "jadx" | "apktool";
type Kind = "java" | "smali" | "xml";

export default function CodeExplorerScreen() {
  const { analysisId: rawId } = useLocalSearchParams<{ analysisId: string | string[] }>();
  const analysisId = Array.isArray(rawId) ? rawId[0] : rawId;
  const { url: apiUrl, token } = getApiConfig();
  const [status, setStatus] = useState<DecompileStatus | null>(null);
  const [tool, setTool] = useState<Tool>("jadx");
  const [kind, setKind] = useState<Kind>("java");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [lineCount, setLineCount] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!apiUrl || !analysisId) {
      setError("Konfigurasi backend atau ID analisis tidak tersedia.");
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        let result = await startDecompilation(apiUrl, analysisId, token);
        if (!active) return;
        setStatus(result);
        while (active && (result.status === "queued" || result.status === "running")) {
          await new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 2500);
          });
          if (!active) return;
          result = await fetchDecompilationStatus(apiUrl, analysisId, token);
          if (active) setStatus(result);
        }
        if (active && result.status === "failed") {
          setError(result.error_message || "Dekompilasi gagal. Periksa status JADX dan Apktool.");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Gagal memulai dekompilasi.");
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [apiUrl, analysisId, token, retryCount]);

  useEffect(() => {
    if (!apiUrl || !analysisId || !status || !["completed", "partial"].includes(status.status)) {
      setFiles([]);
      setSelectedPath("");
      setContent("");
      return;
    }
    let active = true;
    setLoadingFiles(true);
    setError("");
    setSelectedPath("");
    setContent("");
    fetchSourceFiles(apiUrl, analysisId, tool, kind, query.trim(), offset, token)
      .then((result) => {
        if (active) {
          setFiles(result.items);
          setTotal(result.total);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Gagal memuat daftar kode.");
      })
      .finally(() => {
        if (active) setLoadingFiles(false);
      });
    return () => {
      active = false;
    };
  }, [apiUrl, analysisId, status?.status, tool, kind, query, offset, token]);

  const openFile = async (path: string) => {
    if (!apiUrl || !analysisId) return;
    setSelectedPath(path);
    setContent("");
    setLoadingContent(true);
    setError("");
    try {
      const result = await fetchSourceFile(apiUrl, analysisId, tool, kind, path, token);
      setContent(result.content);
      setLineCount(result.line_count);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membuka file kode.");
    } finally {
      setLoadingContent(false);
    }
  };

  const selectKind = (nextTool: Tool, nextKind: Kind) => {
    setTool(nextTool);
    setKind(nextKind);
    setQuery("");
    setOffset(0);
    setSelectedPath("");
    setContent("");
  };

  const statusLabel = status?.status ?? "Menyiapkan";
  const selectedToolStatus = tool === "jadx" ? status?.tools.jadx : status?.tools.apktool;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>APK SCOPE · CODE EXPLORER</Text>
      <Text style={styles.title}>Jelajahi Kode APK</Text>
      <Text style={styles.subtitle}>Java hasil dekompilasi, Smali, dan XML resource.</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Status: {statusLabel}</Text>
        <Text style={styles.helper}>{status?.progress_message ?? "Menghubungi worker dekompilasi..."}</Text>
        {status?.status === "queued" || status?.status === "running" || !status ? (
          <ActivityIndicator color="#8EAEFF" style={styles.loader} />
        ) : null}
        {status?.tools ? (
          <Text style={styles.helper}>
            JADX: {status.tools.jadx.status} ({status.tools.jadx.file_count} file) · Apktool: {status.tools.apktool.status} ({status.tools.apktool.file_count} file)
          </Text>
        ) : null}
        {status?.warnings.map((warning, index) => (
          <Text key={index} style={styles.warning}>{warning}</Text>
        ))}
      </View>

      {status && ["completed", "partial"].includes(status.status) ? (
        <>
          <View style={styles.tabs}>
            <Pressable onPress={() => selectKind("jadx", "java")} style={[styles.tab, tool === "jadx" && styles.activeTab]}>
              <Text style={styles.tabText}>Java</Text>
            </Pressable>
            <Pressable onPress={() => selectKind("apktool", "smali")} style={[styles.tab, kind === "smali" && styles.activeTab]}>
              <Text style={styles.tabText}>Smali</Text>
            </Pressable>
            <Pressable onPress={() => selectKind("apktool", "xml")} style={[styles.tab, kind === "xml" && styles.activeTab]}>
              <Text style={styles.tabText}>XML</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>
            {selectedToolStatus?.status ?? "Belum tersedia"} · {selectedToolStatus?.file_count ?? 0} file
          </Text>
          <TextInput
            value={query}
            onChangeText={(value) => { setQuery(value); setOffset(0); }}
            placeholder="Cari nama atau jalur file..."
            placeholderTextColor="#7D8AA5"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
          />
          {loadingFiles ? <ActivityIndicator color="#8EAEFF" style={styles.loader} /> : null}
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Daftar file ({files.length})</Text>
            {files.length === 0 && !loadingFiles ? <Text style={styles.helper}>Tidak ada file untuk filter ini.</Text> : null}
            {files.map((file) => (
              <Pressable key={file.path} onPress={() => void openFile(file.path)} style={[styles.fileRow, selectedPath === file.path && styles.selectedFile]}>
                <Text style={styles.fileName}>{file.name}</Text>
                <Text style={styles.filePath}>{file.path}</Text>
              </Pressable>
            ))}
            <View style={styles.pagination}>
              <Pressable
                disabled={offset === 0}
                onPress={() => setOffset(Math.max(0, offset - 100))}
                style={[styles.pageButton, offset === 0 && styles.disabledButton]}
              >
                <Text style={styles.pageButtonText}>Sebelumnya</Text>
              </Pressable>
              <Text style={styles.helper}>
                {total === 0 ? 0 : offset + 1}–{Math.min(total, offset + files.length)} dari {total}
              </Text>
              <Pressable
                disabled={offset + 100 >= total}
                onPress={() => setOffset(offset + 100)}
                style={[styles.pageButton, offset + 100 >= total && styles.disabledButton]}
              >
                <Text style={styles.pageButtonText}>Berikutnya</Text>
              </Pressable>
            </View>
          </View>
          {selectedPath ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>{selectedPath}</Text>
              <Text style={styles.helper}>{lineCount} baris · maksimal 1 MiB per file</Text>
              {loadingContent ? <ActivityIndicator color="#8EAEFF" style={styles.loader} /> : (
                <ScrollView horizontal style={styles.codeScroll}>
                  <ScrollView nestedScrollEnabled>
                    <Text selectable style={styles.code}>{content}</Text>
                  </ScrollView>
                </ScrollView>
              )}
            </View>
          ) : null}
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status?.status === "failed" ? (
        <Pressable
          onPress={() => {
            setError("");
            setStatus(null);
            setRetryCount((value) => value + 1);
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Coba dekompilasi lagi</Text>
        </Pressable>
      ) : null}
      <Text style={styles.disclaimer}>Kode ini merupakan hasil dekompilasi, bukan source code asli. Nama dan struktur dapat berubah jika APK menggunakan obfuscation.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1020" },
  container: { padding: 16, paddingBottom: 48, gap: 12 },
  eyebrow: { color: "#7C9BFF", fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" },
  subtitle: { color: "#A8B1C5", fontSize: 12 },
  statusCard: { backgroundColor: "#151D31", borderColor: "#26334D", borderWidth: 1, borderRadius: 12, padding: 13, gap: 5 },
  statusTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  helper: { color: "#8995AC", fontSize: 11, lineHeight: 17 },
  warning: { color: "#E9C477", fontSize: 11, lineHeight: 16 },
  loader: { marginVertical: 10 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, padding: 11, borderRadius: 9, backgroundColor: "#151D31", alignItems: "center" },
  activeTab: { backgroundColor: "#315AC0" },
  tabText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  search: { backgroundColor: "#151D31", color: "#FFFFFF", borderColor: "#34425F", borderWidth: 1, borderRadius: 10, padding: 11 },
  panel: { backgroundColor: "#151D31", borderColor: "#26334D", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  sectionTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  fileRow: { borderBottomColor: "#293650", borderBottomWidth: 1, paddingVertical: 8 },
  selectedFile: { backgroundColor: "#26334D", borderRadius: 6, paddingHorizontal: 6 },
  fileName: { color: "#F2F4FA", fontSize: 12, fontWeight: "700" },
  filePath: { color: "#8995AC", fontSize: 10, marginTop: 3 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 10 },
  pageButton: { backgroundColor: "#26334D", borderRadius: 7, paddingVertical: 8, paddingHorizontal: 10 },
  disabledButton: { opacity: 0.35 },
  pageButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  codeScroll: { maxHeight: 520, backgroundColor: "#0B1020", borderRadius: 8, padding: 10 },
  code: { color: "#C9D4EA", fontSize: 11, lineHeight: 17, fontFamily: "monospace" },
  error: { color: "#FF9292", fontSize: 12 },
  retryButton: { backgroundColor: "#315AC0", borderRadius: 9, padding: 12, alignItems: "center" },
  retryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  disclaimer: { color: "#8995AC", fontSize: 10, lineHeight: 16, marginTop: 8 },
});
