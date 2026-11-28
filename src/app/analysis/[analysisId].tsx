import { useLocalSearchParams } from "expo-router";
import { getApiConfig } from "@/services/api/config";
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

import {
  fetchAnalysis,
  fetchApkFiles,
  fetchDexClasses,
  fetchDexLibraries,
  fetchDexMethods,
  fetchDexPackages,
  fetchDexSummary,
  type AnalysisItem,
  type DexClass,
  type DexLibrary,
  type DexMethod,
  type DexPackage,
  type DexSummary,
} from "@/services/api/client";

type Tab = "overview" | "packages" | "classes" | "libraries" | "files";

export default function AnalysisDetailScreen() {
  const { analysisId } = useLocalSearchParams<{ analysisId: string }>();
  const { url: API_URL, token: API_TOKEN } = getApiConfig();
  const [analysis, setAnalysis] = useState<AnalysisItem | null>(null);
  const [summary, setSummary] = useState<DexSummary | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [packages, setPackages] = useState<DexPackage[]>([]);
  const [classes, setClasses] = useState<DexClass[]>([]);
  const [libraries, setLibraries] = useState<DexLibrary[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [methods, setMethods] = useState<DexMethod[]>([]);
  const [reportLoading, setReportLoading] = useState(!!API_URL);
  const [tabLoading, setTabLoading] = useState(false);
  const [reportError, setReportError] = useState(
    API_URL
      ? ""
      : "Alamat backend belum tersedia. Kembali ke halaman utama dan isi konfigurasi backend.",
  );
  const [tabError, setTabError] = useState("");
  const loading = reportLoading || tabLoading;
  const error = reportError || tabError;

  useEffect(() => {
    if (!API_URL) {
      setReportLoading(false);
      return;
    }
    let active = true;
    setReportLoading(true);
    setReportError("");
    setAnalysis(null);
    setSummary(null);
    Promise.all([
      fetchAnalysis(API_URL, analysisId, API_TOKEN),
      fetchDexSummary(API_URL, analysisId, API_TOKEN),
    ])
      .then(([detail, dex]) => {
        if (!active) return;
        setAnalysis(detail);
        setSummary(dex);
        setReportError("");
      })
      .catch((cause: unknown) => {
        if (active)
          setReportError(
            cause instanceof Error ? cause.message : "Gagal mengambil laporan",
          );
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [analysisId, API_URL, API_TOKEN]);

  useEffect(() => {
    if (!API_URL) {
      setTabLoading(false);
      return;
    }
    let active = true;
    if (tab === "overview") {
      setTabLoading(false);
      return () => {
        active = false;
      };
    }
    setTabLoading(true);
    setTabError("");
    const load = async () => {
      if (tab === "packages") {
        const page = await fetchDexPackages(
          API_URL,
          analysisId,
          query,
          offset,
          API_TOKEN,
        );
        if (active) {
          setPackages(page.items);
          setTotal(page.total);
        }
      } else if (tab === "classes") {
        const page = await fetchDexClasses(
          API_URL,
          analysisId,
          query,
          offset,
          API_TOKEN,
          selectedPackage,
        );
        if (active) {
          setClasses(page.items);
          setTotal(page.total);
        }
      } else if (tab === "libraries") {
        const page = await fetchDexLibraries(
          API_URL,
          analysisId,
          query,
          offset,
          API_TOKEN,
        );
        if (active) {
          setLibraries(page.items);
          setTotal(page.total);
        }
      } else {
        const page = await fetchApkFiles(
          API_URL,
          analysisId,
          query,
          offset,
          API_TOKEN,
        );
        if (active) {
          setFiles(page.items);
          setTotal(page.total);
        }
      }
    };
    load()
      .catch((cause: unknown) => {
        if (active)
          setTabError(
            cause instanceof Error ? cause.message : "Gagal memuat data",
          );
      })
      .finally(() => {
        if (active) setTabLoading(false);
      });
    return () => {
      active = false;
    };
  }, [analysisId, tab, query, offset, selectedPackage, API_URL, API_TOKEN]);

  const reportPackage = analysis?.report?.["package_name"];
  const subtitle =
    typeof reportPackage === "string"
      ? reportPackage
      : (analysis?.sha256 ?? "");

  const chooseTab = (value: Tab) => {
    setTab(value);
    setOffset(0);
    setQuery("");
    setSelectedPackage("");
    setSelectedClass("");
    setMethods([]);
  };

  const openPackage = (item: DexPackage) => {
    setSelectedPackage(item.name);
    setTab("classes");
    setOffset(0);
    setQuery("");
  };

  const openClass = async (item: DexClass) => {
    setSelectedClass(item.name);
    setMethods([]);
    try {
      const result = await fetchDexMethods(
        API_URL,
        analysisId,
        item.name,
        API_TOKEN,
      );
      setMethods(result.items);
    } catch (cause) {
      setTabError(
        cause instanceof Error ? cause.message : "Gagal mengambil method",
      );
    }
  };

  if (loading && !analysis && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#8EAEFF" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>LAPORAN ANALISIS</Text>
      <Text style={styles.title}>
        {analysis?.filename ?? "Detail analisis"}
      </Text>
      <Text style={styles.sub}>{subtitle}</Text>

      <View style={styles.stats}>
        <Stat label="DEX" value={summary?.dex_file_count ?? 0} />
        <Stat label="Package" value={summary?.package_count ?? 0} />
        <Stat label="Class" value={summary?.class_count ?? 0} />
        <Stat label="Method" value={summary?.method_count ?? 0} />
        <Stat label="Library" value={summary?.library_count ?? 0} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {(
          ["overview", "packages", "classes", "libraries", "files"] as Tab[]
        ).map((item) => (
          <Pressable
            key={item}
            onPress={() => chooseTab(item)}
            style={[styles.tab, tab === item && styles.activeTab]}
          >
            <Text
              style={[styles.tabText, tab === item && styles.activeTabText]}
            >
              {tabLabel(item)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {tab !== "overview" ? (
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setOffset(0);
          }}
          placeholder="Cari nama package, class, library, atau file..."
          placeholderTextColor="#7D8AA5"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      ) : null}

      {loading ? (
        <ActivityIndicator color="#8EAEFF" style={styles.loader} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && tab === "overview" ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>
            Status DEX: {summary?.status ?? "belum tersedia"}
          </Text>
          {(summary?.dex_files ?? []).map((item) => (
            <Text key={item.name} style={styles.item}>
              {item.name} · {item.class_count} class
            </Text>
          ))}
          {(summary?.warnings ?? []).map((warning, index) => (
            <Text key={index} style={styles.warning}>
              {warning}
            </Text>
          ))}
          <Text style={styles.helper}>
            Daftar file mentah dipindahkan ke tab File Explorer. Package, class,
            dan library dibaca dari DEX.
          </Text>
        </View>
      ) : null}

      {!loading && tab === "packages" ? (
        <View style={styles.panel}>
          {packages.map((item) => (
            <Pressable
              key={item.name}
              onPress={() => openPackage(item)}
              style={styles.listItem}
            >
              <Text style={styles.item}>{item.name}</Text>
              <Text style={styles.helper}>
                {item.class_count} class · {item.method_count} method · Ketuk
                untuk melihat class
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!loading && tab === "classes" ? (
        <View style={styles.panel}>
          {selectedPackage ? (
            <Pressable
              onPress={() => {
                setSelectedPackage("");
                setOffset(0);
              }}
            >
              <Text style={styles.link}>
                ← Semua package · {selectedPackage}
              </Text>
            </Pressable>
          ) : null}
          {classes.map((item) => (
            <Pressable
              key={item.name}
              onPress={() => void openClass(item)}
              style={styles.listItem}
            >
              <Text style={styles.item}>{item.name}</Text>
              <Text style={styles.helper}>
                {item.dex_file} · {item.method_count} method
              </Text>
            </Pressable>
          ))}
          {selectedClass ? (
            <View style={styles.methods}>
              <Text style={styles.sectionTitle}>Method · {selectedClass}</Text>
              {methods.map((method, index) => (
                <Text
                  key={method.name + method.signature + index}
                  style={styles.method}
                >
                  {method.name}
                  {method.signature}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {!loading && tab === "libraries" ? (
        <View style={styles.panel}>
          {libraries.map((item) => (
            <View key={item.name} style={styles.listItem}>
              <View style={styles.row}>
                <Text style={styles.item}>{item.name}</Text>
                <Text style={styles.confidence}>{item.confidence}</Text>
              </View>
              <Text style={styles.helper}>
                {item.category} · {item.method}
              </Text>
              <Text style={styles.helper}>
                {item.evidence_count} class sebagai bukti · Versi tidak
                ditentukan
              </Text>
              {item.evidence.map((evidence) => (
                <Text key={evidence} style={styles.evidence}>
                  • {evidence}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {!loading && tab === "files" ? (
        <View style={styles.panel}>
          {files.map((file) => (
            <Text key={file} style={styles.file}>
              {file}
            </Text>
          ))}
        </View>
      ) : null}

      {tab !== "overview" ? (
        <View style={styles.pagination}>
          <Pressable
            disabled={offset === 0}
            onPress={() =>
              setOffset(Math.max(0, offset - (tab === "files" ? 100 : 50)))
            }
            style={styles.pageButton}
          >
            <Text style={styles.pageText}>Sebelumnya</Text>
          </Pressable>
          <Text style={styles.helper}>
            {total === 0 ? 0 : offset + 1}–
            {Math.min(total, offset + (tab === "files" ? 100 : 50))} dari{" "}
            {total}
          </Text>
          <Pressable
            disabled={offset + (tab === "files" ? 100 : 50) >= total}
            onPress={() => setOffset(offset + (tab === "files" ? 100 : 50))}
            style={styles.pageButton}
          >
            <Text style={styles.pageText}>Berikutnya</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function tabLabel(tab: Tab): string {
  const labels: Record<Tab, string> = {
    overview: "Ringkasan",
    packages: "Package",
    classes: "Class",
    libraries: "Library",
    files: "File Explorer",
  };
  return labels[tab];
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString("id-ID")}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 18,
    paddingTop: 38,
    paddingBottom: 48,
    backgroundColor: "#0B1020",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B1020",
  },
  eyebrow: {
    color: "#7C9BFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: { color: "#F4F6FC", fontSize: 24, fontWeight: "800", marginTop: 8 },
  sub: { color: "#A8B1C5", fontSize: 12, marginTop: 5 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  stat: {
    flexGrow: 1,
    minWidth: "28%",
    backgroundColor: "#151D31",
    borderRadius: 12,
    padding: 12,
  },
  statValue: { color: "#FFFFFF", fontSize: 21, fontWeight: "800" },
  statLabel: { color: "#8995AC", fontSize: 11, marginTop: 3 },
  tabs: { gap: 8, paddingVertical: 18 },
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 9,
    backgroundColor: "#151D31",
  },
  activeTab: { backgroundColor: "#315AC0" },
  tabText: { color: "#A8B1C5", fontSize: 12, fontWeight: "700" },
  activeTabText: { color: "#FFFFFF" },
  search: {
    backgroundColor: "#151D31",
    color: "#FFFFFF",
    borderColor: "#34425F",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  loader: { margin: 18 },
  panel: {
    backgroundColor: "#151D31",
    borderColor: "#26334D",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 10,
  },
  item: { color: "#F2F4FA", fontSize: 13, fontWeight: "600" },
  helper: { color: "#8995AC", fontSize: 11, lineHeight: 17, marginTop: 4 },
  warning: { color: "#E9C477", fontSize: 12, marginTop: 8 },
  listItem: {
    paddingVertical: 10,
    borderBottomColor: "#293650",
    borderBottomWidth: 1,
  },
  link: { color: "#8EAEFF", fontSize: 12, marginBottom: 8 },
  methods: {
    borderTopColor: "#34425F",
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 12,
  },
  method: {
    color: "#C9D4EA",
    fontSize: 11,
    paddingVertical: 5,
    fontFamily: "monospace",
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  confidence: { color: "#E9C477", fontSize: 11, textTransform: "uppercase" },
  evidence: {
    color: "#9EACC5",
    fontSize: 10,
    marginTop: 3,
    fontFamily: "monospace",
  },
  file: {
    color: "#C9D4EA",
    fontSize: 11,
    paddingVertical: 4,
    fontFamily: "monospace",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    gap: 8,
  },
  pageButton: { backgroundColor: "#26334D", borderRadius: 8, padding: 10 },
  pageText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  error: { color: "#FF9292", marginVertical: 10, fontSize: 12 },
});
