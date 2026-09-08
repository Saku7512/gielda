import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { getCandidates, type Candidate } from "../services/api";

const CAUSE_LABELS: Record<string, string> = {
  market_overreaction: "Przesadzona reakcja rynku",
  fundamental_deterioration: "Pogorszenie fundamentów",
  structural_geopolitical_risk: "Ryzyko strukturalne/geopolityczne",
};

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function CandidateCard({ item }: { item: Candidate }) {
  const score = item.compositeScore ?? item.compositeScorePartial;
  const isPartial = item.compositeScore === null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        <Text style={styles.score}>
          {score.toFixed(1)}
          {isPartial ? " (partial)" : ""}
        </Text>
      </View>
      <Text style={styles.companyName}>
        {item.companyName} · {item.sector}
      </Text>
      <View style={styles.metricsRow}>
        <Text style={styles.metric}>Cena: {item.currentPrice.toFixed(2)}</Text>
        <Text style={styles.metric}>Excess drawdown: {formatPct(item.excessDrawdown)}</Text>
      </View>
      <View style={styles.metricsRow}>
        <Text style={styles.metric}>Fundamenty: {item.fundamentalHealthScore.toFixed(0)}/100</Text>
        {item.aiCause && (
          <Text style={styles.metric}>
            {CAUSE_LABELS[item.aiCause] ?? item.aiCause}
            {item.aiConfidence !== null ? ` (${Math.round(item.aiConfidence * 100)}%)` : ""}
          </Text>
        )}
      </View>
      {item.aiReasoning && <Text style={styles.reasoning}>{item.aiReasoning}</Text>}
    </View>
  );
}

export default function CandidatesScreen() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await getCandidates();
      setCandidates(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Ładowanie kandydatów…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Błąd: {error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={candidates.length === 0 ? styles.centered : undefined}
      data={candidates}
      keyExtractor={(item) => item.symbol}
      renderItem={({ item }) => <CandidateCard item={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={<Text>Brak kandydatów — uruchom screener w backendzie.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#b00020",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  symbol: {
    fontSize: 18,
    fontWeight: "700",
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a7f37",
  },
  companyName: {
    color: "#555",
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metric: {
    fontSize: 13,
    color: "#333",
  },
  reasoning: {
    marginTop: 8,
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },
});
