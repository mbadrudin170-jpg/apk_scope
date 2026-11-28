import { AppBar } from "@/components/app-bar";
import { Scaffold } from "@/components/scaffold";
import { ThemedText } from "@/components/themed-text";

export default function UjiCoba() {
  return (
    <Scaffold appBar={<AppBar title="Tes" />}>
      <ThemedText>Kopi</ThemedText>
    </Scaffold>
  );
}
