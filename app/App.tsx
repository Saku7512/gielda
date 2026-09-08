import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import CandidatesScreen from "./src/screens/CandidatesScreen";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <CandidatesScreen />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
