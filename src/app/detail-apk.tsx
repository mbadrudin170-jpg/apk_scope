import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Collapsible } from "@/components/ui/collapsible";

import {
  getInstalledApkInfo,
  scanInstalledApkFile,
  type ApkInfo,
} from "../../modules/installed-apps/src";
import {
  detectFrameworks,
  detectJsLibrariesFromScan,
  detectFlutterPackagesFromScan,
  getAllJsNeedles,
  getAllFlutterNeedles,
  findFlutterLibraryFile,
  type Detection,
} from "@/services/detection/localDetector";

export default function DetailApk() {
  const { packageName } = useLocalSearchParams<{
    packageName?: string;
  }>();
  const [result, setResult] = useState<{
    pkg: string;
    info: ApkInfo | null;
    error: string;
  } | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);

  useEffect(() => {
    if (!packageName) return;

    let mounted = true;

    getInstalledApkInfo(packageName)
      .then((info) => {
        if (!mounted) return;
        if (!info) {
          setResult({
            pkg: packageName,
            info: null,
            error: "Informasi APK tidak dapat dibaca.",
          });
          return;
        }
        setResult({ pkg: packageName, info, error: "" });
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setResult({
            pkg: packageName,
            info: null,
            error:
              cause instanceof Error ? cause.message : "Gagal menganalisis APK",
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, [packageName]);

  const apkInfo =
    result !== null && result.pkg === packageName ? result.info : null;
  const libraries = apkInfo?.nativeLibs ?? [];
  const allFiles = (apkInfo?.allFiles ?? []).filter(
    (file) => !file.startsWith("res/"),
  );
  const loading =
    !!packageName && (result === null || result.pkg !== packageName);
  const error = !packageName
    ? "Package tidak tersedia."
    : result !== null && result.pkg === packageName
      ? result.error
      : "";

  useEffect(() => {
    if (!apkInfo || !packageName) return;

    let mounted = true;

    (async () => {
      setDetections([]);
      const frameworks = detectFrameworks(apkInfo);
      const hasBundle = apkInfo.allFiles.includes(
        "assets/index.android.bundle",
      );

      let scan: Record<string, number> | null = null;
      if (hasBundle) {
        try {
          scan = await scanInstalledApkFile(
            packageName,
            "assets/index.android.bundle",
            getAllJsNeedles(),
          );
        } catch {
          scan = null;
        }
      }

      const jsLibraries = detectJsLibrariesFromScan(scan);

      const flutterLib = findFlutterLibraryFile(apkInfo.allFiles);
      let flutterScan: Record<string, number> | null = null;
      if (flutterLib) {
        try {
          flutterScan = await scanInstalledApkFile(
            packageName,
            flutterLib,
            getAllFlutterNeedles(),
          );
        } catch {
          flutterScan = null;
        }
      }

      const flutterPackages = detectFlutterPackagesFromScan(flutterScan);
      if (mounted) {
        setDetections([...frameworks, ...jsLibraries, ...flutterPackages]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [apkInfo, packageName]);

  const buildReport = (info: ApkInfo): string => {
    const libs = info.nativeLibs ?? [];
    const files = (info.allFiles ?? []).filter(
      (file) => !file.startsWith("res/"),
    );
    const lines: string[] = [];
    lines.push(`Package: ${info.packageName ?? packageName ?? ""}`);
    lines.push(`Nama: ${info.appName}`);
    lines.push(`Versi: ${info.versionName ?? "-"}`);
    lines.push(`Version code: ${info.versionCode}`);
    lines.push(`Minimum SDK: ${info.minSdk}`);
    lines.push(`Target SDK: ${info.targetSdk}`);
    lines.push(`Jumlah split APK: ${info.splitApkCount}`);
    lines.push(`Jumlah permission: ${info.permissions.length}`);
    lines.push("");
    lines.push("File APK:");
    info.apkFiles.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
    lines.push("Native libraries:");
    libs.forEach((l) => lines.push(`- ${l}`));
    lines.push("");
    lines.push("Semua file di dalam APK:");
    files.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
    lines.push("Permissions:");
    info.permissions.forEach((p) => lines.push(`- ${p}`));
    return lines.join("\n");
  };

  const handleCopy = async () => {
    if (!apkInfo) return;
    await Clipboard.setStringAsync(buildReport(apkInfo));
    Alert.alert("Disalin", "Semua informasi APK telah disalin.");
  };

  const handleDownload = async () => {
    if (!apkInfo) return;
    try {
      const content = buildReport(apkInfo);
      const safeName = (apkInfo.packageName ?? packageName ?? "apk").replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const file = new File(Paths.cache, `${safeName}.txt`);
      if (file.exists) file.delete();
      await file.write(content);
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/plain",
          dialogTitle: "Unduh hasil analisis",
        });
      } else {
        Alert.alert("Tersimpan", `File disimpan di ${file.uri}`);
      }
    } catch (cause: unknown) {
      Alert.alert(
        "Gagal",
        cause instanceof Error ? cause.message : "Gagal mengunduh file.",
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Detail APK</Text>
            {packageName ? <Text style={styles.sub}>{packageName}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleCopy}
              disabled={!apkInfo}
              style={({ pressed }) => [
                styles.copyButton,
                !apkInfo && styles.copyButtonDisabled,
                pressed && styles.copyButtonPressed,
              ]}
            >
              <Text style={styles.copyButtonText}>Salin semua</Text>
            </Pressable>
            <Pressable
              onPress={handleDownload}
              disabled={!apkInfo}
              style={({ pressed }) => [
                styles.copyButton,
                !apkInfo && styles.copyButtonDisabled,
                pressed && styles.copyButtonPressed,
              ]}
            >
              <Text style={styles.copyButtonText}>Unduh .txt</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : apkInfo ? (
          <>
            <Text style={styles.sectionTitle}>Informasi aplikasi</Text>
            <InfoRow label="Nama" value={apkInfo.appName} />
            <InfoRow label="Versi" value={apkInfo.versionName ?? "-"} />
            <InfoRow label="Version code" value={String(apkInfo.versionCode)} />
            <InfoRow label="Minimum SDK" value={String(apkInfo.minSdk)} />
            <InfoRow label="Target SDK" value={String(apkInfo.targetSdk)} />
            <InfoRow
              label="Jumlah split APK"
              value={String(apkInfo.splitApkCount)}
            />
            <InfoRow
              label="Jumlah permission"
              value={String(apkInfo.permissions.length)}
            />

            <Text style={styles.sectionTitle}>File APK</Text>
            {apkInfo.apkFiles.map((file) => (
              <View key={file} style={styles.row}>
                <Text style={styles.item}>{file}</Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Native libraries</Text>
            {libraries.length === 0 ? (
              <Text style={styles.empty}>
                Tidak ada library native yang ditemukan.
              </Text>
            ) : (
              libraries.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.row}>
                  <Text style={styles.item}>{item}</Text>
                </View>
              ))
            )}

            <Collapsible title={`Semua file di dalam APK (${allFiles.length})`}>
              {allFiles.length === 0 ? (
                <Text style={styles.empty}>Tidak ada file yang ditemukan.</Text>
              ) : (
                <FlatList
                  data={allFiles}
                  style={{ backgroundColor: "transparent" }}
                  keyExtractor={(item, index) => `${item}-${index}`}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/detail-kode",
                          params: { file: item, packageName },
                        })
                      }
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.item}>{item}</Text>
                    </Pressable>
                  )}
                  scrollEnabled={false}
                />
              )}
            </Collapsible>
            <Text style={styles.sectionTitle}>Framework & Library (lokal)</Text>
            {detections.length === 0 ? (
              <Text style={styles.empty}>
                Tidak ada deteksi kuat dari APK ini.
              </Text>
            ) : (
              detections.map((detection, index) => (
                <View key={`${detection.name}-${index}`} style={styles.row}>
                  <Text style={styles.item}>
                    {detection.name} — {detection.confidence}
                  </Text>
                  <Text style={styles.sub}>
                    {detection.evidence.join(", ")}
                  </Text>
                  <Text style={styles.sub}>
                    Versi: {detection.version ?? "tidak diketahui"}
                  </Text>
                </View>
              ))
            )}

            <Collapsible title={`Permissions (${apkInfo.permissions.length})`}>
              {apkInfo.permissions.length === 0 ? (
                <Text style={styles.empty}>
                  Tidak ada permission yang tercatat.
                </Text>
              ) : (
                apkInfo.permissions.map((permission) => (
                  <View key={permission} style={styles.row}>
                    <Text style={styles.item}>{permission}</Text>
                  </View>
                ))
              )}
            </Collapsible>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  container: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
  copyButton: {
    backgroundColor: "#26334D",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3B4A6B",
  },
  copyButtonDisabled: {
    opacity: 0.4,
  },
  copyButtonPressed: {
    opacity: 0.7,
  },
  copyButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
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
  sectionTitle: {
    color: "#8EAEFF",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: "#151D31",
    borderWidth: 1,
    borderColor: "#26334D",
  },
  label: {
    color: "#A8B1C5",
    fontSize: 13,
    flex: 1,
  },
  value: {
    color: "#FFFFFF",
    fontSize: 13,
    flex: 1,
    textAlign: "right",
    fontWeight: "600",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: "#151D31",
    borderWidth: 1,
    borderColor: "#26334D",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  item: {
    color: "#E8ECF4",
    fontSize: 13,
  },
  empty: {
    color: "#A8B1C5",
    paddingVertical: 12,
    fontStyle: "italic",
  },
  error: {
    color: "#FF9292",
    marginTop: 8,
  },
});
