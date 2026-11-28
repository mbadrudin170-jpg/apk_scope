import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DetailKode() {
  const { file } = useLocalSearchParams<{ file?: string }>();
  const fileName = Array.isArray(file) ? file[0] : file;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Detail Kode</Text>
        <Text style={styles.subtitle}>{fileName ?? "File tidak dipilih"}</Text>
        <Text style={styles.helper}>
          Konten file akan ditampilkan di sini setelah backend menyediakan
          endpoint baca file hasil dekompilasi.
        </Text>
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
  helper: { color: "#8995AC", fontSize: 12, lineHeight: 18 },
});
