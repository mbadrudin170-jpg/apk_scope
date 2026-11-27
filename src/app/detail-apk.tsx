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

import {
  getInstalledApkInfo,
  type ApkInfo,
} from "../../modules/installed-apps/src";

export default function DetailApk() {
  const { packageName } = useLocalSearchParams<{
    packageName?: string;
  }>();
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);
  const [libraries, setLibraries] = useState<string[]>([]);
  console.log(libraries);
  const [loading, setLoading] = useState(!!packageName);
  const [error, setError] = useState(
    packageName ? "" : "Package tidak tersedia.",
  );

  useEffect(() => {
    if (!packageName) return;

    let mounted = true;
    setLoading(true);
    setError("");

    getInstalledApkInfo(packageName)
      .then((info) => {
        if (!mounted) return;
        if (!info) {
          setError("Informasi APK tidak dapat dibaca.");
          return;
        }
        setApkInfo(info);
        setLibraries(info.nativeLibs);
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(
            cause instanceof Error ? cause.message : "Gagal menganalisis APK",
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [packageName]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Detail APK</Text>
        {packageName ? <Text style={styles.sub}>{packageName}</Text> : null}

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
            <InfoRow label="Jumlah split APK" value={String(apkInfo.splitApkCount)} />
            <InfoRow label="Jumlah permission" value={String(apkInfo.permissions.length)} />

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
              libraries.map((item, index) => {
                console.log(item);
                console.log(libraries);

                return (
                  <View key={`${item}-${index}`} style={styles.row}>
                    <Text style={styles.item}>{item}</Text>
                  </View>
                );
              })
            )}

            <Text style={styles.sectionTitle}>Permissions</Text>
            {apkInfo.permissions.length === 0 ? (
              <Text style={styles.empty}>Tidak ada permission yang tercatat.</Text>
            ) : (
              apkInfo.permissions.map((permission) => (
                <View key={permission} style={styles.row}>
                  <Text style={styles.item}>{permission}</Text>
                </View>
              ))
            )}
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
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
  item: {
    color: "#FFFFFF",
    fontSize: 13,
  },
  empty: {
    color: "#A8B1C5",
    paddingVertical: 12,
  },
  error: {
    color: "#FF9292",
    marginTop: 8,
  },
});
